import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BlobStore } from "./store";

function safeSegments(key: string): string[] {
  const segments = key.split("/").filter(Boolean);
  for (const segment of segments) {
    if (segment === "." || segment === ".." || segment.includes("\\") || segment.includes("\0")) {
      throw new Error(`Key penyimpanan tidak valid: ${key}`);
    }
  }
  return segments;
}

/**
 * Local filesystem driver. Reads/writes under a single base directory so the
 * rest of the app never touches arbitrary server paths.
 */
export class FsBlobStore implements BlobStore {
  readonly driver = "fs";
  readonly persistent: boolean;
  private base: string;

  constructor() {
    this.base = process.env.AOMI_WORKSPACE_DIR || path.join(process.cwd(), ".aomi-data", "workspace");
    this.persistent = !process.env.VERCEL;
  }

  private resolve(key: string): string {
    const target = path.join(this.base, ...safeSegments(key));
    const relative = path.relative(this.base, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Akses di luar workspace ditolak.");
    }
    return target;
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const buffer = await readFile(this.resolve(key));
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true, recursive: true });
  }

  async list(prefix: string): Promise<string[]> {
    const prefixSegments = safeSegments(prefix);
    const root = path.join(this.base, ...prefixSegments);
    const results: string[] = [];
    const walk = async (dir: string, relative: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, nextRelative);
        } else if (entry.isFile()) {
          results.push([...prefixSegments, ...nextRelative.split("/")].join("/"));
        }
      }
    };
    try {
      const info = await stat(root);
      if (info.isFile()) return [prefixSegments.join("/")];
      await walk(root, "");
    } catch {
      return [];
    }
    return results;
  }
}
