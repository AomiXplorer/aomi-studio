/**
 * Request-side guards for the public checkout.
 *
 * These limits are global (Redis), not per instance: a serverless cold start must not hand
 * an attacker a fresh budget. The values are deliberately tight, because a real buyer
 * needs one create per attempt and at most a handful of status polls.
 */
import { incrWithTtl } from "@/lib/db/apikeys";
import { redisConfigured } from "@/lib/db/redis";
import { hashIdentifier, requestIp } from "@/lib/auth/guard";

export function clientIpHash(request: Request): string {
  return hashIdentifier(requestIp(request));
}

export interface LimitResult {
  ok: boolean;
  retryAfter: number;
}

/**
 * Counts one hit against `key`. Without Redis the checkout still works, it just loses the
 * global counter, so the caller can decide to fail closed on its own.
 */
export async function countHit(key: string, limit: number, windowSeconds: number): Promise<LimitResult> {
  if (!redisConfigured()) return { ok: true, retryAfter: 0 };
  try {
    const { count, ttl } = await incrWithTtl(key, windowSeconds);
    if (count > limit) return { ok: false, retryAfter: Math.max(1, ttl || windowSeconds) };
    return { ok: true, retryAfter: 0 };
  } catch {
    // A limiter outage must not take the shop down with it.
    return { ok: true, retryAfter: 0 };
  }
}

export function normaliseEmail(value: string): string {
  return (value || "").trim().toLowerCase();
}

/** One message per problem, written for a buyer rather than for a log. */
export function emailProblem(value: string): string | null {
  const email = normaliseEmail(value);
  if (!email) return "Email wajib diisi.";
  if (email.length > 254) return "Email terlalu panjang.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Format email belum benar. Contoh: nama@gmail.com";
  if (/\.\./.test(email) || email.startsWith(".") || email.includes("@.")) return "Format email belum benar.";
  return null;
}
