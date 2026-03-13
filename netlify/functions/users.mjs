import { getAuthenticatedUser } from "./shared/auth.mjs";
import {
  ACCESS_MANAGER_ROLE,
  canManageUsers,
  createManagedUser,
  listManagedUsers,
  setManagedUserPassword,
  updateManagedUser
} from "./shared/users.mjs";
import { assertSameOrigin, jsonResponse, methodNotAllowed, readJson } from "./shared/http.mjs";

export default async function handler(request) {
  if (!["GET", "POST"].includes(request.method)) {
    return methodNotAllowed(["GET", "POST"]);
  }

  try {
    if (request.method === "POST") {
      assertSameOrigin(request);
    }

    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return jsonResponse({ ok: false, error: "Sesion no valida." }, 401);
    }

    if (!canManageUsers(auth.user)) {
      return jsonResponse({
        ok: false,
        error: `El rol ${auth.user.role} no tiene acceso a la administracion de credenciales.`
      }, 403, {
        "set-cookie": auth.refreshCookie
      });
    }

    if (request.method === "GET") {
      const accounts = await listManagedUsers();
      return jsonResponse({
        ok: true,
        accounts,
        accessManagerRole: ACCESS_MANAGER_ROLE
      }, 200, {
        "set-cookie": auth.refreshCookie
      });
    }

    const body = await readJson(request);
    const action = String(body.action || "").trim();

    if (action === "create") {
      const result = await createManagedUser({
        fullName: body.name,
        role: body.role,
        username: body.username,
        password: body.password,
        actor: auth.user,
        request,
        linkedStaffId: body.linkedStaffId || null
      });

      return jsonResponse({
        ok: true,
        action,
        account: result.account,
        temporaryPassword: result.temporaryPassword
      }, 200, {
        "set-cookie": auth.refreshCookie
      });
    }

    if (action === "update") {
      const result = await updateManagedUser({
        userId: body.userId,
        username: body.username,
        fullName: body.name,
        role: body.role,
        actor: auth.user,
        request
      });

      return jsonResponse({
        ok: true,
        action,
        account: result.account
      }, 200, {
        "set-cookie": auth.refreshCookie
      });
    }

    if (action === "set-password") {
      const result = await setManagedUserPassword({
        userId: body.userId,
        password: body.password,
        actor: auth.user,
        request,
        generated: false
      });

      return jsonResponse({
        ok: true,
        action,
        account: result.account,
        temporaryPassword: result.temporaryPassword
      }, 200, {
        "set-cookie": auth.refreshCookie
      });
    }

    if (action === "reset-password") {
      const result = await setManagedUserPassword({
        userId: body.userId,
        password: "",
        actor: auth.user,
        request,
        generated: true
      });

      return jsonResponse({
        ok: true,
        action,
        account: result.account,
        temporaryPassword: result.temporaryPassword
      }, 200, {
        "set-cookie": auth.refreshCookie
      });
    }

    return jsonResponse({ ok: false, error: "La accion solicitada no es valida." }, 400, {
      "set-cookie": auth.refreshCookie
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 400);
  }
}
