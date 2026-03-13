import crypto from "node:crypto";
import { query, withTransaction } from "./db.mjs";
import { getRequestMeta } from "./http.mjs";

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function formatAuditLog(row) {
  return {
    id: row.id,
    user: row.actor_username,
    name: row.actor_name,
    role: row.actor_role,
    action: row.action,
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
}

export async function insertAuditLog({ user, action, details = {}, request, client = null }) {
  const meta = request ? getRequestMeta(request) : { ipAddress: "unknown", userAgent: "unknown" };
  const payload = [
    createId("LOG"),
    user?.id || null,
    user?.username || "sistema",
    user?.name || "Sistema",
    user?.role || "Administrador",
    String(action || "Accion"),
    JSON.stringify(details || {}),
    meta.ipAddress,
    meta.userAgent
  ];

  const statement = `
    insert into audit_logs (
      id,
      user_id,
      actor_username,
      actor_name,
      actor_role,
      action,
      details,
      ip_address,
      user_agent
    )
    values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
    returning id, actor_username, actor_name, actor_role, action, created_at
  `;

  const executor = client ? client.query.bind(client) : query;
  const result = await executor(statement, payload);
  return formatAuditLog(result.rows[0]);
}

export async function importAuditLogs(logs = [], user, request) {
  if (!Array.isArray(logs) || !logs.length) {
    return 0;
  }

  return withTransaction(async (client) => {
    let imported = 0;
    for (const item of logs.slice(0, 500)) {
      const actor = {
        id: user?.id || null,
        username: String(item.user || user?.username || "sistema"),
        name: String(item.name || user?.name || "Sistema"),
        role: String(item.role || user?.role || "Administrador")
      };

      await insertAuditLog({
        user: actor,
        action: item.action || "Migracion de bitacora",
        details: { importedTimestamp: item.timestamp || null, source: "local-storage" },
        request,
        client
      });
      imported += 1;
    }
    return imported;
  });
}

export async function listAuditLogs(limit = 100) {
  const result = await query(`
    select id, actor_username, actor_name, actor_role, action, created_at
    from audit_logs
    order by created_at desc
    limit $1
  `, [limit]);

  return result.rows.map((row) => formatAuditLog(row));
}
