export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

export function methodNotAllowed(allowed) {
  return jsonResponse({ ok: false, error: `Method not allowed. Use ${allowed}.` }, 405, {
    allow: Array.isArray(allowed) ? allowed.join(", ") : String(allowed || "GET")
  });
}

export async function readJson(request) {
  try {
    const text = await request.text();
    if (!text) {
      return {};
    }
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Invalid JSON body.");
  }
}

export function getRequestMeta(request) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  return {
    ipAddress: forwardedFor.split(",")[0].trim() || request.headers.get("client-ip") || "unknown",
    userAgent: request.headers.get("user-agent") || "unknown",
    origin: request.headers.get("origin") || "",
    host: request.headers.get("host") || ""
  };
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }

  const target = new URL(request.url);
  const targetOrigin = `${target.protocol}//${target.host}`;
  if (origin !== targetOrigin) {
    throw new Error("Origin mismatch.");
  }
}
