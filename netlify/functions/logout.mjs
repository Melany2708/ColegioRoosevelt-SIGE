import { logoutFromRequest } from "./shared/auth.mjs";
import { assertSameOrigin, jsonResponse, methodNotAllowed } from "./shared/http.mjs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
  }

  try {
    assertSameOrigin(request);
    const result = await logoutFromRequest(request);
    return jsonResponse({ ok: true, signedOut: result.sessionDeleted }, 200, {
      "set-cookie": result.cookie
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 400);
  }
}
