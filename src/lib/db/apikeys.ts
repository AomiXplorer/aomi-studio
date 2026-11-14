/**
 * Provider API keys, encrypted at rest.
 *
 * The plaintext key exists in three places only: the request that adds it, the
 * decryption inside the server when a provider call is made, and never in the panel or
 * on Telegram. Stored fields are the sealed ciphertext, a mask for display and a
 * fingerprint used to detect duplicates.
 */
import { randomUUID } from "node:crypto";
import { openSecret, sealSecret, maskSecret, fingerprint, encryptionReady } from "@/lib/crypto/secrets";
import { redis, redisPipeline, redisEval, hgetall, hashToObject } from "./redis";
import { K } from "./keys";

export interface ApiKeyPublic {
  id: string;
  provider: string;
  label: string;
  masked: string;
  fingerprint: string;
  status: "active" | "disabled";
  active: boolean;
  addedAt: string;
  addedBy: string;
  lastUsedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckOk: boolean | null;
}

interface RawKey extends ApiKeyPublic {
  cipher: string;
  iv: string;
  tag: string;
}

function toRaw(raw: Record<string, string> | null): RawKey | null {
  if (!raw || !raw.id) return null;
  return {
    id: raw.id,
    provider: raw.provider || "bangunweb",
    label: raw.label || "",
    masked: raw.masked || "",
    fingerprint: raw.fingerprint || "",
    status: raw.status === "disabled" ? "disabled" : "active",
    active: false,
    addedAt: raw.addedAt || new Date().toISOString(),
    addedBy: raw.addedBy || "system",
    lastUsedAt: raw.lastUsedAt || null,
    lastCheckedAt: raw.lastCheckedAt || null,
    lastCheckOk: raw.lastCheckOk === "1" ? true : raw.lastCheckOk === "0" ? false : null,
    cipher: raw.cipher || "",
    iv: raw.iv || "",
    tag: raw.tag || "",
  };
}

export async function activeKeyId(): Promise<string | null> {
  return redis<string | null>("GET", K.activeKey);
}

export async function addApiKey(input: { provider?: string; label: string; key: string; addedBy: string }): Promise<{ key: ApiKeyPublic } | { error: string }> {
  if (!encryptionReady()) {
    return { error: "AOMI_ENCRYPTION_KEY belum diatur di server, kunci tidak bisa disimpan dengan aman." };
  }
  const value = input.key.trim();
  if (value.length < 12) return { error: "API key terlalu pendek." };
  return addSealedApiKey({
    provider: input.provider,
    label: input.label,
    sealed: sealSecret(value),
    fingerprint: fingerprint(value),
    masked: maskSecret(value),
    addedBy: input.addedBy,
  });
}

/** Used by the Telegram flow, which seals the key the moment it is typed. */
export async function addSealedApiKey(input: {
  provider?: string;
  label: string;
  sealed: { cipher: string; iv: string; tag: string };
  fingerprint: string;
  masked: string;
  addedBy: string;
}): Promise<{ key: ApiKeyPublic } | { error: string }> {
  const mark = input.fingerprint;

  const existing = await listApiKeys();
  if (existing.some((item) => item.fingerprint === mark)) return { error: "API key itu sudah tersimpan." };

  const id = randomUUID();
  const sealed = input.sealed;
  const now = new Date().toISOString();
  await redisPipeline([
    [
      "HSET",
      K.apiKey(id),
      "id", id,
      "provider", input.provider || "bangunweb",
      "label", input.label,
      "masked", input.masked,
      "fingerprint", mark,
      "status", "active",
      "addedAt", now,
      "addedBy", input.addedBy,
      "cipher", sealed.cipher,
      "iv", sealed.iv,
      "tag", sealed.tag,
    ],
    ["SADD", K.apiKeys, id],
  ]);

  // The first key added becomes the active one, otherwise the current stays.
  const current = await activeKeyId();
  if (!current) await redis("SET", K.activeKey, id);

  const created = await getApiKey(id);
  return created ? { key: created } : { error: "Gagal menyimpan API key." };
}

export async function getApiKey(id: string): Promise<ApiKeyPublic | null> {
  const raw = toRaw(await hgetall(K.apiKey(id)));
  if (!raw) return null;
  const active = await activeKeyId();
  const { cipher: _cipher, iv: _iv, tag: _tag, ...rest } = raw;
  return { ...rest, active: active === raw.id };
}

export async function listApiKeys(): Promise<ApiKeyPublic[]> {
  const ids = await redis<string[]>("SMEMBERS", K.apiKeys);
  if (!ids || ids.length === 0) return [];
  const active = await activeKeyId();
  const rows = await redisPipeline(ids.map((id) => ["HGETALL", K.apiKey(id)]));
  return rows
    .map((row) => toRaw(hashToObject(row)))
    .filter((row): row is RawKey => Boolean(row))
    .map((raw) => {
      const { cipher: _cipher, iv: _iv, tag: _tag, ...rest } = raw;
      return { ...rest, active: active === raw.id };
    })
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

/** Atomically switches the active key, but only if the target exists and is enabled. */
export async function setActiveKey(id: string): Promise<{ error?: string }> {
  const target = await getApiKey(id);
  if (!target) return { error: "API key tidak ditemukan." };
  if (target.status !== "active") return { error: "API key itu dinonaktifkan." };
  await redis("SET", K.activeKey, id);
  return {};
}

export async function deleteApiKey(id: string): Promise<{ error?: string; wasActive: boolean }> {
  const target = await getApiKey(id);
  if (!target) return { error: "API key tidak ditemukan.", wasActive: false };
  const wasActive = target.active;
  const commands: (string | number)[][] = [
    ["DEL", K.apiKey(id)],
    ["SREM", K.apiKeys, id],
  ];
  if (wasActive) commands.push(["DEL", K.activeKey]);
  await redisPipeline(commands);
  if (wasActive) {
    const remaining = await listApiKeys();
    const next = remaining.find((item) => item.status === "active");
    if (next) await redis("SET", K.activeKey, next.id);
  }
  return { wasActive };
}

export async function toggleApiKey(id: string, status: "active" | "disabled"): Promise<{ error?: string }> {
  const target = await getApiKey(id);
  if (!target) return { error: "API key tidak ditemukan." };
  await redis("HSET", K.apiKey(id), "status", status);
  if (status === "disabled" && target.active) {
    await redis("DEL", K.activeKey);
    const remaining = (await listApiKeys()).filter((item) => item.status === "active");
    if (remaining[0]) await redis("SET", K.activeKey, remaining[0].id);
  }
  return {};
}

/** The only function that returns plaintext, and only to the provider adapter. */
export async function decryptKey(id: string): Promise<string | null> {
  const raw = toRaw(await hgetall(K.apiKey(id)));
  if (!raw) return null;
  try {
    return openSecret({ cipher: raw.cipher, iv: raw.iv, tag: raw.tag });
  } catch {
    return null;
  }
}

/**
 * Resolves the key a provider call should use: the active key in Redis first, then the
 * environment variable, so adding a key on Telegram takes effect on the next request
 * without a redeploy while a fresh install still works from env alone.
 */
export async function resolveProviderKey(): Promise<{ key: string | null; source: "database" | "env" | "none"; keyId?: string }> {
  const id = await activeKeyId();
  if (id) {
    const value = await decryptKey(id);
    if (value) {
      await redis("HSET", K.apiKey(id), "lastUsedAt", new Date().toISOString());
      return { key: value, source: "database", keyId: id };
    }
  }
  const env = (process.env.BANGUNWEB_API_KEY || "").trim();
  if (env) return { key: env, source: "env" };
  return { key: null, source: "none" };
}

export async function recordKeyCheck(id: string, ok: boolean): Promise<void> {
  await redis("HSET", K.apiKey(id), "lastCheckedAt", new Date().toISOString(), "lastCheckOk", ok ? "1" : "0");
}

/** Throttle guard used by the login lockout, shared by panel and Telegram. */
export async function incrWithTtl(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number }> {
  const [count, ttl] = await redisEval<[number, number]>(
    "local c = redis.call('INCR', KEYS[1]) if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end return {c, redis.call('TTL', KEYS[1])}",
    [key],
    [ttlSeconds],
  );
  return { count: Number(count), ttl: Number(ttl) };
}
