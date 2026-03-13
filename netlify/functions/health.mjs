import { healthCheck } from "./shared/db.mjs";
import { countUsers } from "./shared/auth.mjs";
import { jsonResponse, methodNotAllowed } from "./shared/http.mjs";

export default async function handler(request) {
  if (request.method !== "GET") {
    return methodNotAllowed("GET");
  }

  try {
    const ok = await healthCheck();
    const userCount = await countUsers();
    return jsonResponse({
      ok,
      backend: "netlify-functions-postgres",
      setupRequired: userCount === 0,
      siteId: process.env.SITE_ID || process.env.NETLIFY_SITE_ID || ""
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error.message,
      hint: "Verifica DATABASE_URL y ejecuta db/schema.sql antes del primer login."
    }, 500);
  }
}
