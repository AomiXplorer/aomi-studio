/**
 * Backup and recovery.
 *
 * A snapshot of every application key is taken from Redis, encrypted with AES-256-GCM
 * (the same key that is never stored in the database) and pushed to the private
 * aomi-config repository. Keeping the copy outside Redis is the point: a lost Upstash
 * instance must not mean a lost backup.
 *
 * Nothing is deleted before the new file is confirmed on GitHub, and a restore verifies
 * the checksum of the decrypted payload before it writes a single key.
 */
import { createHash } from "node:crypto";
import { redis, redisPipeline, redisKeys, getJson, setJson, hashToObject } from "./redis";
import { K } from "./keys";
import { sealSecret, openSecret, encryptionReady } from "@/lib/crypto/secrets";

const VOLATILE = ["aomi:login:", "aomi:tg:flow:", "aomi:tg:throttle:"];
const SKIP_EXACT = [K.backupLast, "aomi:backup:meta"];
const KEEP = 5;

export interface BackupMeta {
  ts: string;
  createdAt: string;
  keys: number;
  bytes: number;
  sha256: string;
  path: string;
  actor: string;
}

interface Entry {
  key: string;
  type: "string" | "hash" | "list" | "set";
  value: unknown;
}

function repo(): { slug: string; token: string } | null {
  const slug = (process.env.AOMI_CONFIG_REPO || "AomiXplorer/aomi-config").trim();
  const token = (process.env.AOMI_CONFIG_TOKEN || "").trim();
  return slug && token ? { slug, token } : null;
}

function shouldSkip(key: string): boolean {
  if (SKIP_EXACT.includes(key)) return true;
  return VOLATILE.some((prefix) => key.startsWith(prefix));
}

async function snapshot(): Promise<{ entries: Entry[]; skipped: number }> {
  const keys = (await redisKeys("aomi:*", 5000)).filter((key) => !shouldSkip(key));
  // TYPE per key, in small batches. A backup is rare and correctness matters more than the
  // handful of round trips a pipeline would have saved.
  const types: string[] = [];
  for (let index = 0; index < keys.length; index += 8) {
    const batch = keys.slice(index, index + 8);
    const resolved = await Promise.all(batch.map((key) => redis<string>("TYPE", key).catch(() => "")));
    types.push(...resolved.map((value) => String(value || "")));
  }
  const entries: Entry[] = [];

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const type = String(types[index] || "");
    if (type === "string") {
      const value = await redis<string | null>("GET", key);
      if (value !== null) entries.push({ key, type: "string", value });
    } else if (type === "hash") {
      const value = hashToObject(await redis("HGETALL", key));
      if (Object.keys(value).length > 0) entries.push({ key, type: "hash", value });
    } else if (type === "list") {
      const value = await redis<string[]>("LRANGE", key, 0, -1);
      if (value && value.length > 0) entries.push({ key, type: "list", value });
    } else if (type === "set") {
      const value = await redis<string[]>("SMEMBERS", key);
      if (value && value.length > 0) entries.push({ key, type: "set", value });
    } else {
      // An unexpected or empty TYPE answer still should not lose a record.
      const hash = hashToObject(await redis("HGETALL", key));
      if (Object.keys(hash).length > 0) entries.push({ key, type: "hash", value: hash });
    }
  }
  return { entries, skipped: keys.length - entries.length };
}

async function putFile(path: string, content: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const target = repo();
  if (!target) return { ok: false, error: "AOMI_CONFIG_REPO/AOMI_CONFIG_TOKEN belum diatur." };
  const response = await fetch(`https://api.github.com/repos/${target.slug}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${target.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, content: Buffer.from(content, "utf8").toString("base64") }),
    signal: AbortSignal.timeout(15000),
  }).catch((error) => ({ ok: false, status: 0, text: () => String(error) }) as unknown as Response);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { ok: false, error: `GitHub ${response.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

export async function listBackupFiles(): Promise<{ name: string; sha: string; size: number }[]> {
  const target = repo();
  if (!target) return [];
  const response = await fetch(`https://api.github.com/repos/${target.slug}/contents/backup`, {
    headers: { Authorization: `Bearer ${target.token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  }).catch(() => null);
  if (!response || !response.ok) return [];
  const items = (await response.json()) as { name: string; sha: string; size: number }[];
  return items
    .filter((item) => item.name.endsWith(".json.enc"))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function createBackup(actor: string): Promise<{ meta?: BackupMeta; error?: string }> {
  if (!encryptionReady()) return { error: "AOMI_ENCRYPTION_KEY belum diatur, backup tidak bisa dienkripsi." };
  if (!repo()) return { error: "Repo backup privat belum dikonfigurasi (AOMI_CONFIG_REPO/AOMI_CONFIG_TOKEN)." };

  const { entries } = await snapshot();
  const payload = JSON.stringify({ version: 1, createdAt: new Date().toISOString(), entries });
  const sha256 = createHash("sha256").update(payload).digest("hex");
  const sealed = sealSecret(payload);
  const body = JSON.stringify({ version: 1, sha256, sealed });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `backup/aomi-${ts}.json.enc`;
  const upload = await putFile(path, body, `backup: ${entries.length} keys at ${ts}`);
  if (!upload.ok) return { error: upload.error };

  const meta: BackupMeta = {
    ts,
    createdAt: new Date().toISOString(),
    keys: entries.length,
    bytes: body.length,
    sha256,
    path,
    actor,
  };
  await setJson(K.backupLast, meta);

  // Prune only after the new file is safely on GitHub.
  const files = await listBackupFiles();
  for (const file of files.slice(KEEP)) {
    await fetch(`https://api.github.com/repos/${repo()!.slug}/contents/backup/${file.name}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${repo()!.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: `prune ${file.name}`, sha: file.sha }),
    }).catch(() => null);
  }

  return { meta };
}

export async function restoreBackup(path: string, dryRun = false): Promise<{ restored?: number; error?: string; keys?: string[] }> {
  if (!encryptionReady()) return { error: "AOMI_ENCRYPTION_KEY belum diatur, backup tidak bisa dibuka." };
  const target = repo();
  if (!target) return { error: "Repo backup privat belum dikonfigurasi." };
  const safePath = path.replace(/^\/+/, "");
  if (!/^backup\/[A-Za-z0-9._-]+\.json\.enc$/.test(safePath)) return { error: "Nama file backup tidak valid." };

  const response = await fetch(`https://api.github.com/repos/${target.slug}/contents/${safePath}`, {
    headers: { Authorization: `Bearer ${target.token}`, Accept: "application/vnd.github.raw+json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!response || !response.ok) return { error: `Tidak bisa membaca ${safePath} (${response?.status ?? "network"}).` };

  let parsed: { sha256: string; sealed: { cipher: string; iv: string; tag: string } };
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    return { error: "File backup rusak." };
  }

  let payload: string;
  try {
    payload = openSecret(parsed.sealed);
  } catch {
    return { error: "Gagal membuka backup: kunci enkripsi berbeda atau file diubah." };
  }

  const digest = createHash("sha256").update(payload).digest("hex");
  if (digest !== parsed.sha256) return { error: "Checksum backup tidak cocok, restore dibatalkan." };

  const data = JSON.parse(payload) as { entries: Entry[] };
  if (dryRun) return { restored: 0, keys: data.entries.map((entry) => entry.key) };

  let restored = 0;
  for (const entry of data.entries) {
    if (entry.type === "string" && typeof entry.value === "string") {
      await redis("SET", entry.key, entry.value);
    } else if (entry.type === "hash" && entry.value && typeof entry.value === "object") {
      const pairs = Object.entries(entry.value as Record<string, string>).flat();
      if (pairs.length > 0) await redis("HSET", entry.key, ...(pairs as [string, ...(string | number)[]]));
    } else if (entry.type === "list" && Array.isArray(entry.value)) {
      await redis("DEL", entry.key);
      if (entry.value.length > 0) await redis("RPUSH", entry.key, ...(entry.value as string[]));
    } else if (entry.type === "set" && Array.isArray(entry.value)) {
      await redis("DEL", entry.key);
      if (entry.value.length > 0) await redis("SADD", entry.key, ...(entry.value as string[]));
    }
    restored += 1;
  }
  return { restored };
}

export async function backupStatus(): Promise<{ last: BackupMeta | null; files: number; configured: boolean; encryption: boolean }> {
  const [last, files] = await Promise.all([
    getJson<BackupMeta | null>(K.backupLast, null),
    listBackupFiles().catch(() => []),
  ]);
  return { last, files: files.length, configured: Boolean(repo()), encryption: encryptionReady() };
}
