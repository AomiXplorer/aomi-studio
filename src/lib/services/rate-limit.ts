/**
 * In-process fixed-window rate limiter. Serverless instances each keep their own
 * window, which is fine for abuse damping on a personal deployment; swap in Redis
 * if you need a global limit.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limitPerMinute: number): { ok: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return { ok: true, remaining: limitPerMinute - 1, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limitPerMinute) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limitPerMinute - bucket.count, retryAfter: 0 };
}

export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
  return `${scope}:${ip}`;
}

if (typeof setInterval === "function") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (now > bucket.resetAt) buckets.delete(key);
  }, 120_000);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}
