import { logoutFromRequest } from "./shared/auth.mjs";

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

export default async function handler(request) {
  if (!["GET", "POST"].includes(request.method)) {
    return redirect("/");
  }

  const result = await logoutFromRequest(request);
  return redirect("/?logout=1", {
    "set-cookie": result.cookie
  });
}
