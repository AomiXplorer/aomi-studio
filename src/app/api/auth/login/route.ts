import { NextResponse } from "next/server";
import { z } from "zod";
import { loadAuthConfig, sessionSecret } from "@/lib/auth/config";
import { authenticate } from "@/lib/auth/accounts";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { hashIdentifier, requestIp } from "@/lib/auth/guard";
import { withSecurityHeaders } from "@/lib/auth/headers";
import { sameOrigin } from "@/lib/auth/require";
import { errorResponse, parseBody } from "@/lib/api";
import { rateLimit } from "@/lib/services/rate-limit";
import { incrWithTtl } from "@/lib/db/apikeys";
import { audit } from "@/lib/db/audit";
import { redis, redisConfigured } from "@/lib/db/redis";
import { K } from "@/lib/db/keys";
import { touchLogin } from "@/lib/db/users";
import { verifyTurnstile } from "@/lib/auth/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
  // Present only when the browser ran a Cloudflare challenge.
  turnstileToken: z.string().max(4096).optional(),
});

const MAX_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return withSecurityHeaders(errorResponse("Origin not allowed.", 403));
  }

  const secret = sessionSecret();
  if (!secret) {
    return withSecurityHeaders(errorResponse("Sign-in is not configured on this server.", 503));
  }

  const ip = requestIp(request);
  const ipHash = hashIdentifier(ip);
  const ipWindow = rateLimit(`login:ip:${ipHash}`, 12);
  if (!ipWindow.ok) {
    const blocked = errorResponse("Too many sign-in attempts. Try again shortly.", 429);
    blocked.headers.set("Retry-After", String(ipWindow.retryAfter));
    return withSecurityHeaders(blocked);
  }

  const parsed = await parseBody(request, schema);
  if (parsed.error) return withSecurityHeaders(parsed.error);

  // The challenge is settled before any credential is compared: a bot that cannot pass it
  // never gets to spend a password attempt, and the account lockout stays for humans.
  const challenge = await verifyTurnstile(parsed.data.turnstileToken, ip);
  if (!challenge.ok) {
    return withSecurityHeaders(errorResponse(challenge.message, challenge.status));
  }

  const username = parsed.data.username.trim();
  const userKey = username.toLowerCase();

  // Brute force protection is global now, not per instance: five wrong passwords lock
  // the account for fifteen minutes even across cold starts and separate functions.
  if (redisConfigured()) {
    const lock = await redis<string | null>("GET", K.loginFail(userKey)).catch(() => null);
    if (Number(lock || 0) >= MAX_FAILURES) {
      const ttl = Number(await redis<number>("TTL", K.loginFail(userKey)).catch(() => LOCK_SECONDS)) || LOCK_SECONDS;
      const locked = errorResponse("Too many attempts. This account is locked for now.", 429);
      locked.headers.set("Retry-After", String(ttl));
      return withSecurityHeaders(locked);
    }
    const ipCount = await incrWithTtl(`aomi:login:ip:${ipHash}`, 60).catch(() => ({ count: 0, ttl: 60 }));
    if (ipCount.count > 30) {
      const blocked = errorResponse("Too many sign-in attempts. Try again shortly.", 429);
      blocked.headers.set("Retry-After", String(ipCount.ttl));
      return withSecurityHeaders(blocked);
    }
  }

  const outcome = await authenticate(username, parsed.data.password);

  if (!outcome.ok) {
    const state = await loadAuthConfig();
    if (!outcome.reason || outcome.reason === "invalid") {
      if (redisConfigured()) await incrWithTtl(K.loginFail(userKey), LOCK_SECONDS).catch(() => null);
      await audit({
        actorType: "user",
        actorId: outcome.ok ? "" : userKey_hash(userKey),
        action: "auth.login_failed",
        target: userKey,
        ip: ipHash,
      });
      if (!state.config) {
        return withSecurityHeaders(
          errorResponse("The owner credentials are not available on this server. Contact the owner on WhatsApp.", 503),
        );
      }
      const fails = redisConfigured()
        ? Number(await redis<string | null>("GET", K.loginFail(userKey)).catch(() => 0) || 0)
        : 0;
      if (fails >= MAX_FAILURES) {
        const locked = errorResponse("Too many attempts. Account locked for 15 minutes.", 429);
        locked.headers.set("Retry-After", String(LOCK_SECONDS));
        return withSecurityHeaders(locked);
      }
      // Identical answer for an unknown username and a wrong password.
      return withSecurityHeaders(errorResponse("Incorrect username or password.", 401));
    }
    if (outcome.reason === "banned") {
      await audit({ actorType: "user", actorId: "", action: "auth.login_banned", target: userKey, ip: ipHash });
      return withSecurityHeaders(errorResponse("This account has been disabled. Contact the owner.", 403));
    }
    return withSecurityHeaders(errorResponse("Incorrect username or password.", 401));
  }

  const user = outcome.user;
  if (redisConfigured()) {
    await redis("DEL", K.loginFail(userKey)).catch(() => null);
    await touchLogin(user.id).catch(() => null);
  }

  const token = await createSessionToken(
    { username: user.username, uid: user.id, role: user.role, version: user.sessionVersion },
    secret,
    request.headers.get("user-agent"),
  );

  await audit({
    actorType: outcome.isOwner ? "owner" : "user",
    actorId: user.id,
    action: "auth.login",
    target: user.username,
    detail: outcome.isOwner ? "owner account" : user.role,
    ip: ipHash,
  });

  const response = NextResponse.json({
    ok: true,
    user: { username: user.username, role: user.role, displayName: user.username },
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return withSecurityHeaders(response);
}

/** Short stable hash for the audit trail: enough to correlate, not enough to leak. */
function userKey_hash(value: string): string {
  return hashIdentifier(value);
}
