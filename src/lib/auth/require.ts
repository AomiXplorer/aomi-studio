import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { sessionSecret } from "@/lib/auth/config";
import { SESSION_COOKIE, readSessionToken, type SessionClaims } from "@/lib/auth/session";

/**
 * Defence in depth behind the middleware: each handler that touches the provider or a
 * workspace re-checks the signed session, so a future routing mistake cannot expose
 * data on its own.
 */
export async function requireSession(): Promise<{ claims: SessionClaims; error?: never } | { claims?: never; error: NextResponse }> {
  const secret = sessionSecret();
  if (!secret) return { error: errorResponse("Auth belum dikonfigurasi di server.", 503) };

  const jar = await cookies();
  const headerList = await headers();
  const claims = await readSessionToken(jar.get(SESSION_COOKIE)?.value, secret, headerList.get("user-agent"));
  if (!claims) return { error: errorResponse("Sesi tidak valid. Masuk dulu.", 401) };

  return { claims };
}

/** Same-origin check for state-changing requests, on top of SameSite cookies. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients still need a valid session cookie
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
