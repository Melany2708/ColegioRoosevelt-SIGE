import { getAuthenticatedUser } from "./shared/auth.mjs";
import { insertAuditLog } from "./shared/audit.mjs";
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

    const body = await readJson(request);
    const action = String(body.action || "Accion del sistema").trim();
    const log = await insertAuditLog({
      user: auth.user,
      action,
      details: body.details || {},
      request
    });

    return jsonResponse({ ok: true, log }, 200, {
      "set-cookie": auth.refreshCookie
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 400);
  }
}
