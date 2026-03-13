import { Pool } from "pg";

let pool;

function buildSslConfig(databaseUrl) {
  if (!databaseUrl) {
    return undefined;
  }

  if (databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")) {
    return false;
  }

  return { rejectUnauthorized: false };
}

export function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or NETLIFY_DATABASE_URL is not configured.");
  }

  pool = new Pool({
    connectionString,
    ssl: buildSslConfig(connectionString),
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function withTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function healthCheck() {
  const result = await query("select 1 as ok");
  return result.rows[0]?.ok === 1;
}

