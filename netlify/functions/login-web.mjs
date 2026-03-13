import { loginWithPassword } from "./shared/auth.mjs";
import { assertSameOrigin } from "./shared/http.mjs";

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: {
      "cache-control": "no-store",
      location,
      ...headers
    }
  });
}

function buildFailureRedirect(message) {
  const url = new URL("/", "https://placeholder.local");
  url.searchParams.set("login_error", message || "No se pudo iniciar sesion.");
  return `${url.pathname}${url.search}${url.hash}`;
}

async function readCredentials(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      username: String(form.get("username") || ""),
      password: String(form.get("password") || "")
    };
  }

  const payload = await request.json().catch(() => ({}));
  return {
    username: String(payload.username || ""),
    password: String(payload.password || "")
  };
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return redirect(buildFailureRedirect("Metodo no permitido para el login."));
  }

  try {
    assertSameOrigin(request);
    const credentials = await readCredentials(request);
    const result = await loginWithPassword({
      username: credentials.username,
      password: credentials.password,
      request
    });

    if (!result.ok) {
      return redirect(buildFailureRedirect(result.error || "Credenciales invalidas."));
    }

    return redirect("/", {
      "set-cookie": result.cookie
    });
  } catch (error) {
    return redirect(buildFailureRedirect(error.message || "No se pudo iniciar sesion."));
  }
}
