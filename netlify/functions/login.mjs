import { countUsers, loginWithPassword } from "./shared/auth.mjs";
import { assertSameOrigin, jsonResponse, methodNotAllowed, readJson } from "./shared/http.mjs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return methodNotAllowed("POST");
  }

  try {
    assertSameOrigin(request);
    const userCount = await countUsers();
    if (userCount === 0) {
      return jsonResponse({
        ok: false,
        error: "No existe un usuario administrador configurado.",
        hint: "Ejecuta scripts/seed-users.mjs antes de habilitar el login."
      }, 409);
    }

    const body = await readJson(request);
    const result = await loginWithPassword({
      username: body.username,
      password: body.password,
      request
    });

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, result.status || 401);
    }

    return jsonResponse({
      ok: true,
      user: result.user,
      session: result.session
    }, 200, {
      "set-cookie": result.cookie
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 400);
  }
}
