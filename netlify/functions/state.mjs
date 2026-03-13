import { getAuthenticatedUser } from "./shared/auth.mjs";
import { insertAuditLog } from "./shared/audit.mjs";
import { assertSameOrigin, jsonResponse, methodNotAllowed, readJson } from "./shared/http.mjs";
import { saveSnapshot } from "./shared/snapshot.mjs";
import { ACCESS_MANAGER_ROLE } from "./shared/users.mjs";

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
    if (auth.user.role === ACCESS_MANAGER_ROLE) {
      return jsonResponse({
        ok: false,
        error: "El rol de control de accesos no puede modificar el estado academico."
      }, 403, {
        "set-cookie": auth.refreshCookie
      });
    }

    const body = await readJson(request);
    if (!body.state || typeof body.state !== "object") {
      return jsonResponse({ ok: false, error: "El estado enviado no es valido." }, 400);
    }

    const snapshot = await saveSnapshot(body.state, auth.user.id, "database");
    await insertAuditLog({
      user: auth.user,
      action: body.action || "Actualizacion de datos centralizados",
      details: { scope: body.scope || "state-sync", updatedAt: snapshot.updatedAt },
      request
    });

    return jsonResponse({
      ok: true,
      updatedAt: snapshot.updatedAt,
      source: snapshot.source
    }, 200, {
      "set-cookie": auth.refreshCookie
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 400);
  }
}
