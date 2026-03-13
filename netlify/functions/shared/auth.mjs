import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "./db.mjs";
import { buildExpiredSessionCookie, buildSessionCookie, getSessionMaxAgeSeconds, readCookie } from "./cookies.mjs";
import { getRequestMeta } from "./http.mjs";
import { insertAuditLog } from "./audit.mjs";

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + getSessionMaxAgeSeconds());
  return expiresAt;
}

export function toPublicUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    name: row.full_name,
    role: row.role
  };
}

export function toPublicSession(row, user) {
  if (!row || !user) {
    return null;
  }

  return {
    id: row.id,
    username: user.username,
    name: user.name,
    role: user.role,
    startedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : String(row.last_seen_at),
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at)
  };
}

export async function countUsers() {
  const result = await query("select count(*)::int as total from app_users where is_active = true");
  return Number(result.rows[0]?.total || 0);
}

export async function loginWithPassword({ username, password, request }) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const candidatePassword = String(password || "");
  if (!normalizedUsername || !candidatePassword) {
    return { ok: false, error: "Usuario y contrasena son obligatorios.", status: 400 };
  }

  const userResult = await query(`
    select id, username, password_hash, full_name, role, is_active
    from app_users
    where username = $1
    limit 1
  `, [normalizedUsername]);
  const row = userResult.rows[0];

  if (!row || !row.is_active) {
    return { ok: false, error: "Credenciales invalidas.", status: 401 };
  }

  const matches = await bcrypt.compare(candidatePassword, row.password_hash);
  if (!matches) {
    return { ok: false, error: "Credenciales invalidas.", status: 401 };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const meta = getRequestMeta(request);
  const expiresAt = buildExpiryDate();

  const sessionResult = await query(`
    insert into app_sessions (
      id,
      user_id,
      session_token_hash,
      created_at,
      last_seen_at,
      expires_at,
      ip_address,
      user_agent
    )
    values ($1, $2, $3, now(), now(), $4, $5, $6)
    returning id, created_at, last_seen_at, expires_at
  `, [createId("SES"), row.id, tokenHash, expiresAt.toISOString(), meta.ipAddress, meta.userAgent]);

  const user = toPublicUser(row);
  const session = toPublicSession(sessionResult.rows[0], user);
  await insertAuditLog({ user, action: "Inicio de sesion", request, details: { sessionId: session.id } });

  return {
    ok: true,
    user,
    session,
    cookie: buildSessionCookie(token)
  };
}

export async function getAuthenticatedUser(request) {
  const token = readCookie(request);
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const result = await query(`
    select
      s.id as session_id,
      s.created_at,
      s.last_seen_at,
      s.expires_at,
      u.id,
      u.username,
      u.full_name,
      u.role,
      u.is_active
    from app_sessions s
    join app_users u on u.id = s.user_id
    where s.session_token_hash = $1
      and s.expires_at > now()
    limit 1
  `, [tokenHash]);

  const row = result.rows[0];
  if (!row || !row.is_active) {
    return null;
  }

  const expiresAt = buildExpiryDate();
  await query(`
    update app_sessions
    set last_seen_at = now(), expires_at = $2
    where session_token_hash = $1
  `, [tokenHash, expiresAt.toISOString()]);

  const user = {
    id: row.id,
    username: row.username,
    name: row.full_name,
    role: row.role
  };
  const session = {
    id: row.session_id,
    username: row.username,
    name: row.full_name,
    role: row.role,
    startedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    lastSeenAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  return {
    user,
    session,
    refreshCookie: buildSessionCookie(token)
  };
}

export async function logoutFromRequest(request) {
  const token = readCookie(request);
  if (!token) {
    return { cookie: buildExpiredSessionCookie(), sessionDeleted: false };
  }

  const auth = await getAuthenticatedUser(request);
  const tokenHash = hashSessionToken(token);
  await query("delete from app_sessions where session_token_hash = $1", [tokenHash]);

  if (auth?.user) {
    await insertAuditLog({ user: auth.user, action: "Cierre de sesion", request, details: { sessionId: auth.session.id } });
  }

  return {
    cookie: buildExpiredSessionCookie(),
    sessionDeleted: true
  };
}
