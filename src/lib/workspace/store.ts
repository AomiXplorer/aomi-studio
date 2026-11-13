import { AsyncLocalStorage } from "node:async_hooks";
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

/**
 * Request-scoped store. Client storage mode seeds an in-memory store per request
 * so no shared disk is required; without a scope the process-wide store is used.
 */
const scope = new AsyncLocalStorage<BlobStore>();

export function runWithStore<T>(store: BlobStore, fn: () => T | Promise<T>): T | Promise<T> {
  return scope.run(store, fn);
}

export function getStore(): BlobStore {
  const active = scope.getStore();
  if (active) return active;
  if (cached) return cached;
  const driver = (process.env.AOMI_STORAGE || "fs").toLowerCase();
  if (driver === "s3") {
    cached = new S3BlobStore();
  } else {
    cached = new FsBlobStore();
  }
  return cached;
}

/**
 * True when this process cannot keep a workspace between requests (serverless
 * hosts with a per-instance /tmp). The browser then owns the workspace. Override
 * with AOMI_CLIENT_STORAGE=1 or =0 when the default guess is wrong.
 */
export function clientStorageMode(): boolean {
  const override = (process.env.AOMI_CLIENT_STORAGE || "").toLowerCase();
  if (override === "1") return true;
  if (override === "0") return false;
  return !getStore().persistent;
}

export function storageStatus() {
  const store = getStore();
  if (clientStorageMode()) {
    return {
      driver: "browser",
      persistent: true,
      note: "Workspace disimpan di browser ini dan dikirim ke server pada setiap permintaan, karena filesystem host tidak bertahan antar request.",
    };
  }
  return {
    driver: store.driver,
    persistent: store.persistent,
    note:
      store.driver === "s3"
        ? "Workspace tersimpan permanen di object storage S3-compatible."
        : store.persistent
          ? "Workspace tersimpan di filesystem host ini dan bertahan antar restart."
          : "Workspace disimpan di /tmp yang bersifat per-instance. Di Vercel file bisa hilang saat cold start atau pindah instance, jadi untuk data yang bertahan set AOMI_STORAGE=s3 dengan bucket S3-compatible.",
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
