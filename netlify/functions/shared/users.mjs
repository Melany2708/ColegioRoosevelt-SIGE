import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query, withTransaction } from "./db.mjs";
import { insertAuditLog } from "./audit.mjs";

export const ACCESS_MANAGER_ROLE = "Control de accesos";

const ACCOUNT_ROLES = new Set([
  "Administrador",
  "Direccion",
  "Caja / tesoreria",
  "Secretaria",
  "Docentes",
  ACCESS_MANAGER_ROLE
]);

const ROLE_ALIASES = {
  Administrador: "Administrador",
  Direccion: "Direccion",
  Director: "Direccion",
  Docente: "Docentes",
  Docentes: "Docentes",
  Secretaria: "Secretaria",
  Tesoreria: "Caja / tesoreria",
  "Caja / tesoreria": "Caja / tesoreria",
  [ACCESS_MANAGER_ROLE]: ACCESS_MANAGER_ROLE
};

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function stripAccents(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeUsernameCandidate(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

function buildBaseUsername(fullName) {
  const parts = stripAccents(fullName)
    .toLowerCase()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!parts.length) {
    return "usuario";
  }

  if (parts.length === 1) {
    return normalizeUsernameCandidate(parts[0]);
  }

  const initial = parts[0].slice(0, 1) || "u";
  const surname = parts.length === 2 ? parts[1] : parts[parts.length - 2];
  return normalizeUsernameCandidate(`${initial}${surname}`) || "usuario";
}

function normalizeRole(role) {
  const normalized = ROLE_ALIASES[String(role || "").trim()] || String(role || "").trim();
  if (!ACCOUNT_ROLES.has(normalized)) {
    throw new Error("El rol de acceso solicitado no es valido.");
  }
  return normalized;
}

async function resolveAvailableUsername(fullName, preferredUsername, client) {
  const requested = normalizeUsernameCandidate(preferredUsername);
  if (requested) {
    const duplicate = await client.query("select 1 from app_users where username = $1 limit 1", [requested]);
    if (duplicate.rows.length) {
      throw new Error("El nombre de usuario ya existe. Elige otro diferente.");
    }
    return requested;
  }

  const base = buildBaseUsername(fullName) || "usuario";
  let candidate = base;
  let suffix = 1;

  while (true) {
    const duplicate = await client.query("select 1 from app_users where username = $1 limit 1", [candidate]);
    if (!duplicate.rows.length) {
      return candidate;
    }
    const nextSuffix = String(suffix);
    candidate = `${base.slice(0, Math.max(1, 24 - nextSuffix.length))}${nextSuffix}`;
    suffix += 1;
  }
}

function generateTemporaryPassword() {
  const fragment = crypto.randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
  return `Rsvt!${fragment}`;
}

function toManagedAccount(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.full_name,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
  };
}

async function getManagedAccountById(userId, client) {
  const result = await client.query(`
    select id, username, full_name, role, is_active, created_at, updated_at
    from app_users
    where id = $1
    limit 1
  `, [String(userId || "")]);
  return result.rows[0] || null;
}

export function canManageUsers(user) {
  return [ACCESS_MANAGER_ROLE, "Administrador"].includes(String(user?.role || ""));
}

export async function listManagedUsers() {
  const result = await query(`
    select id, username, full_name, role, is_active, created_at, updated_at
    from app_users
    where is_active = true
    order by
      case role
        when 'Administrador' then 1
        when '${ACCESS_MANAGER_ROLE}' then 2
        when 'Direccion' then 3
        when 'Secretaria' then 4
        when 'Caja / tesoreria' then 5
        when 'Docentes' then 6
        else 99
      end,
      full_name asc
  `);

  return result.rows.map((row) => toManagedAccount(row));
}

export async function createManagedUser({ fullName, role, username, password, actor, request, linkedStaffId = null }) {
  const trimmedName = String(fullName || "").trim();
  if (!trimmedName) {
    throw new Error("El nombre completo es obligatorio para crear el acceso.");
  }

  const normalizedRole = normalizeRole(role);

  return withTransaction(async (client) => {
    const resolvedUsername = await resolveAvailableUsername(trimmedName, username, client);
    const temporaryPassword = String(password || "").trim() || generateTemporaryPassword();
    if (temporaryPassword.length < 8) {
      throw new Error("La contrasena debe tener al menos 8 caracteres.");
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const result = await client.query(`
      insert into app_users (
        id,
        username,
        password_hash,
        full_name,
        role,
        is_active,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, true, now(), now())
      returning id, username, full_name, role, is_active, created_at, updated_at
    `, [createId("USR"), resolvedUsername, passwordHash, trimmedName, normalizedRole]);

    const account = toManagedAccount(result.rows[0]);
    await insertAuditLog({
      user: actor,
      action: "Creacion de acceso",
      details: {
        accountId: account.id,
        username: account.username,
        role: account.role,
        linkedStaffId
      },
      request,
      client
    });

    return {
      account,
      temporaryPassword
    };
  });
}

export async function updateManagedUser({ userId, username, fullName, role, actor, request }) {
  return withTransaction(async (client) => {
    const current = await getManagedAccountById(userId, client);
    if (!current) {
      throw new Error("La cuenta solicitada no existe.");
    }

    const nextName = String(fullName || current.full_name || current.name || "").trim() || current.full_name;
    const nextRole = role ? normalizeRole(role) : current.role;
    let nextUsername = current.username;

    if (typeof username === "string") {
      const normalizedUsername = normalizeUsernameCandidate(username);
      if (!normalizedUsername) {
        throw new Error("Ingresa un nombre de usuario valido.");
      }

      if (normalizedUsername !== current.username) {
        const duplicate = await client.query("select 1 from app_users where username = $1 and id <> $2 limit 1", [normalizedUsername, current.id]);
        if (duplicate.rows.length) {
          throw new Error("Ese nombre de usuario ya esta en uso.");
        }
        nextUsername = normalizedUsername;
      }
    }

    const result = await client.query(`
      update app_users
      set username = $2,
          full_name = $3,
          role = $4,
          updated_at = now()
      where id = $1
      returning id, username, full_name, role, is_active, created_at, updated_at
    `, [current.id, nextUsername, nextName, nextRole]);

    const account = toManagedAccount(result.rows[0]);
    await insertAuditLog({
      user: actor,
      action: "Actualizacion de acceso",
      details: {
        accountId: account.id,
        username: account.username,
        role: account.role
      },
      request,
      client
    });

    return { account };
  });
}

export async function setManagedUserPassword({ userId, password, actor, request, generated = false }) {
  const nextPassword = String(password || "").trim() || (generated ? generateTemporaryPassword() : "");
  if (!nextPassword) {
    throw new Error("Debes ingresar una contrasena valida.");
  }
  if (nextPassword.length < 8) {
    throw new Error("La contrasena debe tener al menos 8 caracteres.");
  }

  return withTransaction(async (client) => {
    const current = await getManagedAccountById(userId, client);
    if (!current) {
      throw new Error("La cuenta solicitada no existe.");
    }

    const passwordHash = await bcrypt.hash(nextPassword, 10);
    const result = await client.query(`
      update app_users
      set password_hash = $2,
          updated_at = now()
      where id = $1
      returning id, username, full_name, role, is_active, created_at, updated_at
    `, [current.id, passwordHash]);

    const account = toManagedAccount(result.rows[0]);
    await insertAuditLog({
      user: actor,
      action: generated ? "Restablecimiento de contrasena" : "Actualizacion de contrasena",
      details: {
        accountId: account.id,
        username: account.username
      },
      request,
      client
    });

    return {
      account,
      temporaryPassword: nextPassword
    };
  });
}
