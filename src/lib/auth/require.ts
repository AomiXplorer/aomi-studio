import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { sessionSecret } from "@/lib/auth/config";
import { SESSION_COOKIE, readSessionToken, type SessionClaims } from "@/lib/auth/session";
import { accountForSession } from "@/lib/auth/accounts";
import type { RawUser } from "@/lib/db/users";

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

export interface AccountContext {
  claims: SessionClaims;
  user: RawUser;
  isOwner: boolean;
}

/**
 * Session plus the live account record. A disabled account or a bumped session version
 * (ban, password reset, delete) fails here even though the cookie signature still holds,
 * which is what makes those admin actions take effect immediately.
 */
export async function requireAccount(): Promise<{ account: AccountContext; error?: never } | { account?: never; error: NextResponse }> {
  const gate = await requireSession();
  if (gate.error) return { error: gate.error };

  const resolved = await accountForSession(gate.claims.sub, gate.claims.uid);
  if (!resolved) return { error: errorResponse("Akun tidak ditemukan.", 401) };
  if (resolved.user.status === "banned") return { error: errorResponse("Akun dinonaktifkan.", 403) };
  if (gate.claims.ver && gate.claims.ver !== resolved.user.sessionVersion) {
    return { error: errorResponse("Sesi berakhir. Masuk lagi.", 401) };
  }

  const claims: SessionClaims = {
    ...gate.claims,
    uid: resolved.user.id,
    role: resolved.user.role,
  };
  return { account: { claims, user: resolved.user, isOwner: resolved.isOwner } };
}

export async function requireAdmin(): Promise<{ account: AccountContext; error?: never } | { account?: never; error: NextResponse }> {
  const gate = await requireAccount();
  if (gate.error) return { error: gate.error };
  if (gate.account.user.role !== "admin") {
    return { error: errorResponse("Hanya admin yang boleh melakukan ini.", 403) };
  }
  return { account: gate.account };
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
