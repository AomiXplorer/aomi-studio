/**
 * Session tokens are signed with HMAC-SHA256 using Web Crypto, so the same code
 * verifies a cookie inside Edge middleware and inside Node route handlers. Only
 * the signature and the claims travel to the browser: the secret never leaves the
 * server, and nothing else about the session is stored client-side.
 */

export const SESSION_COOKIE = "aomi_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionClaims {
  sub: string;
  role: "owner" | "member";
  iat: number;
  exp: number;
  /** Short fingerprint of the user agent that created the session. */
  ua: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function userAgentFingerprint(userAgent: string | null): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode((userAgent || "").slice(0, 320)));
  return toBase64Url(new Uint8Array(digest)).slice(0, 16);
}

export async function createSessionToken(
  user: { username: string; role: "owner" | "member" },
  secret: string,
  userAgent: string | null,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    sub: user.username,
    role: user.role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    ua: await userAgentFingerprint(userAgent),
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the claims only when the signature, the expiry and the fingerprint all hold. */
export async function readSessionToken(
  token: string | undefined | null,
  secret: string,
  userAgent: string | null,
): Promise<SessionClaims | null> {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importKey(secret),
      fromBase64Url(signature),
      encoder.encode(body),
    );
    if (!valid) return null;
    const claims = JSON.parse(decoder.decode(fromBase64Url(body))) as SessionClaims;
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number") return null;
    if (claims.role !== "owner" && claims.role !== "member") return null;
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
    if (claims.ua !== (await userAgentFingerprint(userAgent))) return null;
    return claims;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
