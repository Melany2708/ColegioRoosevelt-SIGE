import { getAuthenticatedUser } from "./shared/auth.mjs";
import { importAuditLogs, insertAuditLog } from "./shared/audit.mjs";
import { saveSnapshot } from "./shared/snapshot.mjs";
import { assertSameOrigin, jsonResponse, methodNotAllowed, readJson } from "./shared/http.mjs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
  }

  try {
    assertSameOrigin(request);
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return jsonResponse({ ok: false, error: "Sesion no valida." }, 401);
    }

    if (auth.user.role !== "Administrador") {
      return jsonResponse({ ok: false, error: "Solo el administrador puede migrar datos locales." }, 403);
    }

    const body = await readJson(request);
    if (!body.state || typeof body.state !== "object") {
      return jsonResponse({ ok: false, error: "No se recibio un estado valido para importar." }, 400);
    }

    const snapshot = await saveSnapshot(body.state, auth.user.id, "imported-local-storage");
    const importedLogs = await importAuditLogs(body.logs || [], auth.user, request);
    await insertAuditLog({
      user: auth.user,
      action: "Migracion inicial desde localStorage",
      details: { importedLogs, updatedAt: snapshot.updatedAt },
      request
    });

    return jsonResponse({
      ok: true,
      updatedAt: snapshot.updatedAt,
      importedLogs
    }, 200, {
      "set-cookie": auth.refreshCookie
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 400);
  }
}
