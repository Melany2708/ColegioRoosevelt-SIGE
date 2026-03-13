import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import { query } from "../netlify/functions/shared/db.mjs";
import { createDefaultAppState } from "../netlify/functions/shared/default-state.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultSeedPath = path.resolve(__dirname, "..", "seed", "users.sample.json");

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function ensureSnapshot() {
  const result = await query("select id from app_snapshots where id = $1 limit 1", ["main"]);
  if (result.rows[0]) {
    return false;
  }

  const defaultState = createDefaultAppState();
  await query(`
    insert into app_snapshots (id, data, updated_at, snapshot_source)
    values ($1, $2::jsonb, now(), $3)
  `, ["main", JSON.stringify(defaultState), "seed-script"]);
  return true;
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultSeedPath;
  const raw = await fs.readFile(inputPath, "utf8");
  const normalizedRaw = raw.replace(/^\uFEFF/, "");
  const users = JSON.parse(normalizedRaw);
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error("The seed file must contain at least one user.");
  }

  for (const user of users) {
    const username = String(user.username || "").trim().toLowerCase();
    const password = String(user.password || "").trim();
    const name = String(user.name || "").trim();
    const role = String(user.role || "").trim();

    if (!username || !password || !name || !role) {
      throw new Error(`Invalid seed user entry for ${JSON.stringify(user)}`);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await query(`
      insert into app_users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
      values ($1, $2, $3, $4, $5, true, now(), now())
      on conflict (username)
      do update set
        password_hash = excluded.password_hash,
        full_name = excluded.full_name,
        role = excluded.role,
        is_active = true,
        updated_at = now()
    `, [createId("USR"), username, passwordHash, name, role]);
  }

  const createdSnapshot = await ensureSnapshot();
  console.log(`Seeded ${users.length} users from ${inputPath}`);
  console.log(createdSnapshot ? "Default snapshot created." : "Snapshot already exists.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

