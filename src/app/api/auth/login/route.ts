import { NextResponse } from "next/server";
import { z } from "zod";
import { findUser, loadAuthConfig, sessionSecret } from "@/lib/auth/config";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { hashIdentifier, loginStatus, recordFailure, recordSuccess, requestIp } from "@/lib/auth/guard";
import { withSecurityHeaders } from "@/lib/auth/headers";
import { sameOrigin } from "@/lib/auth/require";
import { errorResponse, parseBody } from "@/lib/api";
import { rateLimit } from "@/lib/services/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return withSecurityHeaders(errorResponse("Asal permintaan tidak diizinkan.", 403));
  }

  const secret = sessionSecret();
  if (!secret) {
    return withSecurityHeaders(errorResponse("Sign-in is not configured on this server.", 503));
  }

  const ipKey = `login:ip:${hashIdentifier(requestIp(request))}`;
  const ipWindow = rateLimit(ipKey, 12);
  if (!ipWindow.ok) {
    const blocked = errorResponse("Too many sign-in attempts. Try again shortly.", 429);
    blocked.headers.set("Retry-After", String(ipWindow.retryAfter));
    return withSecurityHeaders(blocked);
  }

  const parsed = await parseBody(request, schema);
  if (parsed.error) return withSecurityHeaders(parsed.error);

  const username = parsed.data.username.trim();
  const userKey = `login:user:${username.toLowerCase()}`;

  const status = loginStatus(userKey);
  if (!status.ok) {
    const locked = errorResponse("Too many attempts. This account is locked for now.", 429);
    locked.headers.set("Retry-After", String(status.retryAfter));
    return withSecurityHeaders(locked);
  }

  const state = await loadAuthConfig();
  if (!state.config) {
    // Never pretend a wrong password when the server simply has no credential source.
    return withSecurityHeaders(errorResponse("The owner credentials are not available on this server. Contact the owner on WhatsApp.", 503));
  }

  const user = findUser(state.config, username);
  const passwordOk = await verifyPassword(parsed.data.password, user?.scrypt);

  if (!user || !passwordOk) {
    const outcome = recordFailure(userKey);
    console.warn("[auth] login ditolak", {
      ip: hashIdentifier(requestIp(request)),
      user: hashIdentifier(username.toLowerCase()),
      remaining: outcome.remaining,
      locked: outcome.locked,
    });
    // Identical answer for an unknown username and a wrong password.
    const message = "Incorrect username or password.";
    if (outcome.locked) {
      const locked = errorResponse("Too many attempts. Account locked for 15 minutes.", 429);
      locked.headers.set("Retry-After", "900");
      return withSecurityHeaders(locked);
    }
    return withSecurityHeaders(errorResponse(message, 401));
  }

  recordSuccess(userKey);
  const token = await createSessionToken({ username: user.username, role: user.role }, secret, request.headers.get("user-agent"));

  const response = NextResponse.json({
    ok: true,
    user: { username: user.username, role: user.role, displayName: user.displayName ?? user.username },
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  console.info("[auth] login diterima", { user: hashIdentifier(user.username.toLowerCase()), ip: hashIdentifier(requestIp(request)) });
  return withSecurityHeaders(response);
}
