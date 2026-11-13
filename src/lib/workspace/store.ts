import { FsBlobStore } from "./fs-driver";
import { S3BlobStore } from "./s3-driver";

export interface BlobStore {
  readonly driver: string;
  /** Whether data survives a restart of the process / a new serverless instance. */
  readonly persistent: boolean;
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, data: Uint8Array, contentType?: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

let cached: BlobStore | null = null;

export function getStore(): BlobStore {
  if (cached) return cached;
  const driver = (process.env.AOMI_STORAGE || "fs").toLowerCase();
  if (driver === "s3") {
    cached = new S3BlobStore();
  } else {
    cached = new FsBlobStore();
  }
  return cached;
}

export function storageStatus() {
  const store = getStore();
  return {
    driver: store.driver,
    persistent: store.persistent,
    note:
      store.driver === "s3"
        ? "Workspace tersimpan permanen di object storage S3-compatible."
        : store.persistent
          ? "Workspace tersimpan di filesystem host ini dan bertahan antar restart."
          : "Workspace disimpan di filesystem sementara (/tmp). Di Vercel isinya hilang saat instance didaur ulang, jadi untuk produksi set AOMI_STORAGE=s3.",
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function readText(key: string): Promise<string | null> {
  const bytes = await getStore().get(key);
  return bytes ? decoder.decode(bytes) : null;
}

export async function writeText(key: string, value: string): Promise<void> {
  await getStore().put(key, encoder.encode(value), "application/json; charset=utf-8");
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await readText(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await writeText(key, JSON.stringify(value));
}
