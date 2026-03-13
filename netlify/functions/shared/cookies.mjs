const sessionCookieName = process.env.SESSION_COOKIE_NAME || "sge_session";
const defaultMaxAgeSeconds = Number(process.env.SESSION_TTL_HOURS || 12) * 60 * 60;

export function getSessionCookieName() {
  return sessionCookieName;
}

export function getSessionMaxAgeSeconds() {
  return defaultMaxAgeSeconds;
}

export function readCookie(request, cookieName = sessionCookieName) {
  const cookieHeader = request.headers.get("cookie") || "";
  const parts = cookieHeader.split(";").map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = part.slice(0, separatorIndex).trim();
    if (name !== cookieName) {
      continue;
    }
    return decodeURIComponent(part.slice(separatorIndex + 1));
  }
  return "";
}

export function buildSessionCookie(token, overrides = {}) {
  const secure = overrides.secure ?? process.env.NODE_ENV !== "development";
  const maxAge = Number(overrides.maxAge ?? defaultMaxAgeSeconds);
  const cookieParts = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];

  if (secure) {
    cookieParts.push("Secure");
  }

  return cookieParts.join("; ");
}

export function buildExpiredSessionCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
