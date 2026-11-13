import type { BlobStore } from "./store";

/**
 * Per-request store used when the browser holds the workspace (client storage
 * mode). It lives for a single request: the snapshot is seeded before the agent
 * runs and read back afterwards, so serverless instances never need shared disk.
 */
export class MemoryBlobStore implements BlobStore {
  readonly driver = "memory";
  readonly persistent = false;
  private data = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | null> {
    const value = this.data.get(key);
    return value ? value.slice() : null;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    this.data.set(key, data.slice());
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}
