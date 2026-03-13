import { query } from "./db.mjs";
import { createDefaultAppState, normalizeAppState } from "./default-state.mjs";

const SNAPSHOT_ID = "main";

export async function getSnapshot() {
  const result = await query(`
    select id, data, updated_at, snapshot_source
    from app_snapshots
    where id = $1
    limit 1
  `, [SNAPSHOT_ID]);

  if (result.rows[0]) {
    return {
      state: normalizeAppState(result.rows[0].data),
      updatedAt: result.rows[0].updated_at instanceof Date ? result.rows[0].updated_at.toISOString() : String(result.rows[0].updated_at),
      source: result.rows[0].snapshot_source || "database"
    };
  }

  const state = createDefaultAppState();
  await query(`
    insert into app_snapshots (id, data, updated_at, snapshot_source)
    values ($1, $2::jsonb, now(), $3)
    on conflict (id) do nothing
  `, [SNAPSHOT_ID, JSON.stringify(state), "default"]);

  return {
    state,
    updatedAt: new Date().toISOString(),
    source: "default"
  };
}

export async function saveSnapshot(state, userId, source = "database") {
  const normalized = normalizeAppState(state);
  const result = await query(`
    insert into app_snapshots (id, data, updated_at, updated_by, snapshot_source)
    values ($1, $2::jsonb, now(), $3, $4)
    on conflict (id)
    do update set
      data = excluded.data,
      updated_at = now(),
      updated_by = excluded.updated_by,
      snapshot_source = excluded.snapshot_source
    returning updated_at
  `, [SNAPSHOT_ID, JSON.stringify(normalized), userId || null, source]);

  return {
    state: normalized,
    updatedAt: result.rows[0]?.updated_at instanceof Date ? result.rows[0].updated_at.toISOString() : new Date().toISOString(),
    source
  };
}
