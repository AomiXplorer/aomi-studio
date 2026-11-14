/**
 * Upstash Redis over the REST API.
 *
 * The REST transport was chosen over a TCP client on purpose: it works from every
 * runtime (local sandbox, Vercel node functions), it survives cold starts without a
 * connection pool, and it cannot leave a socket behind. Every command is a single
 * HTTPS request, pipelines are one request with up to 100 commands.
 *
 * Env:
 *   UPSTASH_REDIS_REST_URL    (preferred) or UPSTASH_REDIS_URL (rediss:// host is reused)
 *   UPSTASH_REDIS_REST_TOKEN  (preferred) or UPSTASH_REDIS_TOKEN
 */

export class RedisError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "RedisError";
    this.status = status;
  }
}

function restBase(): string | null {
  const direct = process.env.UPSTASH_REDIS_REST_URL?.trim();
  if (direct) return direct.replace(/\/+$/, "");
  const tcp = process.env.UPSTASH_REDIS_URL?.trim();
  if (!tcp) return null;
  try {
    const url = new URL(tcp);
    return `https://${url.hostname}`;
  } catch {
    return null;
  }
}

function restToken(): string | null {
  return (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN || "").trim() || null;
}

export function redisConfigured(): boolean {
  return Boolean(restBase() && restToken());
}

type Arg = string | number;

function encode(args: Arg[]): string {
  return JSON.stringify(args.map((value) => (typeof value === "number" ? String(value) : value)));
}

async function call<T>(path: string, body: string): Promise<T> {
  const base = restBase();
  const token = restToken();
  if (!base || !token) throw new RedisError("Redis belum dikonfigurasi di server.", 503);

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch {
    throw new RedisError("Tidak bisa menghubungi Redis.", 503);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new RedisError(`Redis menolak perintah (${response.status}).`, response.status);
  }
  try {
    const payload = JSON.parse(text) as { result?: T; error?: string };
    if (payload.error) throw new RedisError(payload.error, 500);
    return payload.result as T;
  } catch (error) {
    if (error instanceof RedisError) throw error;
    throw new RedisError("Jawaban Redis tidak bisa dibaca.", 502);
  }
}

/** One command. */
export async function redis<T = unknown>(...args: Arg[]): Promise<T> {
  return call<T>("", encode(args));
}

/** Several commands in one round trip (not atomic; use `redisEval` when it matters). */
/**
 * One request, many commands.
 *
 * The pipeline endpoint answers with a bare array of { result } objects, unlike the single
 * command endpoint which wraps its answer in { result }. Both shapes are unwrapped here so
 * callers only ever see the values.
 */
export async function redisPipeline(commands: Arg[][]): Promise<unknown[]> {
  if (commands.length === 0) return [];
  const base = restBase();
  const token = restToken();
  if (!base || !token) throw new RedisError("Redis belum dikonfigurasi di server.", 503);

  let response: Response;
  try {
    response = await fetch(`${base}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: `[${commands.map(encode).join(",")}]`,
      cache: "no-store",
    });
  } catch {
    throw new RedisError("Tidak bisa menghubungi Redis.", 503);
  }

  const text = await response.text();
  if (!response.ok) throw new RedisError(`Redis menolak pipeline (${response.status}).`, response.status);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new RedisError("Jawaban pipeline tidak bisa dibaca.", 502);
  }

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { result?: unknown }).result)
      ? ((payload as { result: unknown[] }).result)
      : [];

  return rows.map((row) => {
    if (row && typeof row === "object" && "error" in (row as Record<string, unknown>)) {
      throw new RedisError(String((row as Record<string, unknown>).error), 500);
    }
    return row && typeof row === "object" && "result" in (row as Record<string, unknown>)
      ? (row as { result: unknown }).result
      : row;
  });
}

/** Atomic script. Keep scripts short and keys in KEYS, values in ARGV. */
export async function redisEval<T = unknown>(script: string, keys: string[], args: Arg[] = []): Promise<T> {
  return call<T>("", encode(["EVAL", script, keys.length, ...keys, ...args]));
}

export async function redisPing(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    const result = await redis<string>("PING");
    return { ok: result === "PONG", latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function redisKeys(pattern: string, limit = 2000): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis<[string, string[]]>("SCAN", cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (Array.isArray(batch)) found.push(...batch);
  } while (cursor !== "0" && found.length < limit);
  return found.slice(0, limit);
}

/** JSON helpers: everything user facing is stored as one JSON string per key. */
export function decode<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  return decode<T>(await redis<string | null>("GET", key), fallback);
}

export async function setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const payload = JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) await redis("SET", key, payload, "EX", ttlSeconds);
  else await redis("SET", key, payload);
}

/**
 * HGETALL normalised to an object.
 *
 * The REST transport answers a hash as a flat [field, value, field, value] array, while a
 * TCP client answers an object. Everything in this app expects the object shape, so the
 * conversion happens in exactly one place.
 */
export async function hgetall(key: string): Promise<Record<string, string>> {
  const raw = await redis<string[] | Record<string, string> | null>("HGETALL", key);
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const result: Record<string, string> = {};
    for (let index = 0; index + 1 < raw.length; index += 2) result[String(raw[index])] = String(raw[index + 1]);
    return result;
  }
  return raw;
}

/** Same normalisation for a value that came back from a pipeline. */
export function hashToObject(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const result: Record<string, string> = {};
    for (let index = 0; index + 1 < raw.length; index += 2) result[String(raw[index])] = String(raw[index + 1]);
    return result;
  }
  if (typeof raw === "object") return raw as Record<string, string>;
  return {};
}
