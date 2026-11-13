import { createHash } from "node:crypto";

/**
 * Login throttling. Five wrong passwords inside ten minutes lock that username for
 * fifteen minutes, and the caller also applies a per-IP window on top. State lives in
 * the instance, so a serverless cold start resets it: good enough for a personal app,
 * and the per-IP limiter plus the hashing cost still make guessing expensive.
 */

interface Attempt {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

const attempts = new Map<string, Attempt>();

export function loginStatus(key: string): { ok: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry) return { ok: true, retryAfter: 0, remaining: MAX_FAILURES };
  if (entry.lockedUntil > now) {
    return { ok: false, retryAfter: Math.ceil((entry.lockedUntil - now) / 1000), remaining: 0 };
  }
  if (now - entry.windowStart > WINDOW_MS) {
    attempts.delete(key);
    return { ok: true, retryAfter: 0, remaining: MAX_FAILURES };
  }
  return { ok: true, retryAfter: 0, remaining: Math.max(0, MAX_FAILURES - entry.failures) };
}

export function recordFailure(key: string): { locked: boolean; remaining: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { failures: 1, windowStart: now, lockedUntil: 0 });
    return { locked: false, remaining: MAX_FAILURES - 1 };
  }
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
    return { locked: true, remaining: 0 };
  }
  return { locked: false, remaining: MAX_FAILURES - entry.failures };
}

export function recordSuccess(key: string): void {
  attempts.delete(key);
}

/** IPs are only ever kept hashed, so a log line can rate-limit abuse without storing addresses. */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}
