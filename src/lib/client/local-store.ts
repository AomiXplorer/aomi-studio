"use client";

import type { Asset, FileEntry, ProjectMeta, StoredMessage } from "@/lib/workspace/service";

/**
 * Browser storage for the workspace. Used when NEXT_PUBLIC_AOMI_CLIENT_STORAGE=1,
 * which is what makes Aomi work on hosts without a shared disk (Vercel functions
 * get a fresh /tmp per instance). The server rebuilds this workspace in memory
 * for each request, so nothing is lost between turns.
 */

const PREFIX = "aomi.workspace.v1";
const PROJECTS_KEY = `${PREFIX}.projects`;
const filesKey = (id: string) => `${PREFIX}.files.${id}`;
const messagesKey = (id: string) => `${PREFIX}.messages.${id}`;
const assetsKey = (id: string) => `${PREFIX}.assets.${id}`;

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  "html", "htm", "css", "scss", "sass", "less", "js", "jsx", "ts", "tsx", "mjs", "cjs", "json", "jsonc",
  "md", "mdx", "txt", "yml", "yaml", "toml", "ini", "env", "gitignore", "svg", "xml", "csv", "sh", "py",
  "rb", "go", "rs", "java", "kt", "php", "sql", "prisma", "lock", "log", "conf", "cfg",
]);

export interface StoredFile {
  path: string;
  content: string;
  encoding: "utf8" | "base64";
  updatedAt: string;
}

export class LocalStorageError extends Error {
  code = "storage_full";
}

function isTextPath(path: string): boolean {
  const name = path.split("/").pop() || path;
  if (!name.includes(".")) return true;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return TEXT_EXTENSIONS.has(ext);
}

function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    svg: "image/svg+xml", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
    ico: "image/x-icon", pdf: "application/pdf",
  };
  return map[ext] || (isTextPath(path) ? "text/plain; charset=utf-8" : "application/octet-stream");
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new LocalStorageError(
      "Penyimpanan browser penuh. Hapus project lama atau pindahkan workspace ke object storage.",
    );
  }
}

export function storageNote() {
  return "Workspace disimpan di browser ini (localStorage) dan ikut terkirim ke server pada setiap permintaan.";
}

export function sanitizeClientPath(input: string): string {
  const value = String(input || "").trim().replace(/\\/g, "/");
  if (!value) throw new Error("Path file wajib diisi.");
  if (value.includes("\0")) throw new Error("Path mengandung karakter tidak valid.");
  const segments = value.split("/").filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === "..")) throw new Error("Path traversal tidak diizinkan.");
  if (!segments.length) throw new Error("Path tidak valid.");
  return segments.join("/");
}

export const local = {
  projects: {
    list(): ProjectMeta[] {
      return readJson<ProjectMeta[]>(PROJECTS_KEY, []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    get(id: string): ProjectMeta | null {
      return this.list().find((project) => project.id === id) || null;
    },
    saveMeta(meta: ProjectMeta): void {
      const projects = this.list().filter((project) => project.id !== meta.id);
      projects.unshift(meta);
      writeJson(PROJECTS_KEY, projects);
    },
    update(id: string, patch: Partial<ProjectMeta>): ProjectMeta {
      const current = this.get(id);
      if (!current) throw new Error("Project tidak ditemukan.");
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      this.saveMeta(next);
      return next;
    },
    remove(id: string): void {
      writeJson(PROJECTS_KEY, this.list().filter((project) => project.id !== id));
      window.localStorage.removeItem(filesKey(id));
      window.localStorage.removeItem(messagesKey(id));
      window.localStorage.removeItem(assetsKey(id));
    },
  },
  files: {
    all(id: string): StoredFile[] {
      return readJson<StoredFile[]>(filesKey(id), []);
    },
    list(id: string): FileEntry[] {
      return this.all(id)
        .map((file) => ({ path: file.path, size: file.encoding === "utf8" ? file.content.length : Math.round((file.content.length * 3) / 4), isText: file.encoding === "utf8" }))
        .sort((a, b) => a.path.localeCompare(b.path));
    },
    read(id: string, path: string) {
      const safe = sanitizeClientPath(path);
      const file = this.all(id).find((entry) => entry.path === safe);
      if (!file) throw new Error(`File tidak ditemukan: ${safe}`);
      return {
        path: file.path,
        content: file.content,
        encoding: file.encoding,
        size: file.encoding === "utf8" ? file.content.length : Math.round((file.content.length * 3) / 4),
        mime: mimeForPath(file.path),
      };
    },
    write(id: string, path: string, content: string, encoding: "utf8" | "base64" = "utf8"): { path: string; before: string | null } {
      const safe = sanitizeClientPath(path);
      const size = encoding === "utf8" ? new TextEncoder().encode(content).length : Math.round((content.length * 3) / 4);
      if (size > MAX_FILE_BYTES) throw new Error(`File melebihi batas ${Math.round(MAX_FILE_BYTES / 1024)} KB.`);
      const files = this.all(id);
      const existing = files.find((file) => file.path === safe);
      const before = existing ? existing.content : null;
      const next = files.filter((file) => file.path !== safe);
      next.push({ path: safe, content, encoding, updatedAt: new Date().toISOString() });
      writeJson(filesKey(id), next.sort((a, b) => a.path.localeCompare(b.path)));
      this.touchProject(id);
      return { path: safe, before };
    },
    remove(id: string, path: string): void {
      const safe = sanitizeClientPath(path);
      writeJson(filesKey(id), this.all(id).filter((file) => file.path !== safe));
      this.touchProject(id);
    },
    rename(id: string, from: string, to: string): void {
      const source = sanitizeClientPath(from);
      const target = sanitizeClientPath(to);
      const files = this.all(id);
      const file = files.find((entry) => entry.path === source);
      if (!file) throw new Error(`File tidak ditemukan: ${source}`);
      if (files.some((entry) => entry.path === target)) throw new Error(`File sudah ada: ${target}`);
      writeJson(
        filesKey(id),
        files.map((entry) => (entry.path === source ? { ...entry, path: target, updatedAt: new Date().toISOString() } : entry)).sort((a, b) => a.path.localeCompare(b.path)),
      );
      this.touchProject(id);
    },
    setAll(id: string, files: StoredFile[]): void {
      const max = 2 * 1024 * 1024;
      let total = 0;
      for (const file of files) {
        const size = file.encoding === "utf8" ? new TextEncoder().encode(file.content).length : Math.round((file.content.length * 3) / 4);
        if (size > max) throw new Error(`File ${file.path} melebihi batas ${Math.round(max / 1024)} KB.`);
        total += Math.max(0, size - 64);
      }
      if (total > 4 * 1024 * 1024) {
        throw new LocalStorageError("Workspace terlalu besar untuk penyimpanan browser (batas sekitar 4 MB).");
      }
      writeJson(filesKey(id), files);
    },
    touchProject(id: string): void {
      const project = local.projects.get(id);
      if (project) local.projects.update(id, {});
    },
  },
  messages: {
    list(id: string): StoredMessage[] {
      return readJson<StoredMessage[]>(messagesKey(id), []);
    },
    set(id: string, messages: StoredMessage[]): void {
      writeJson(messagesKey(id), messages.slice(-200));
    },
    clear(id: string): void {
      window.localStorage.removeItem(messagesKey(id));
    },
    append(id: string, message: StoredMessage): void {
      const messages = this.list(id).filter((entry) => entry.id !== message.id);
      messages.push(message);
      this.set(id, messages);
    },
  },
  assets: {
    list(id: string): Asset[] {
      return readJson<Asset[]>(assetsKey(id), []);
    },
    save(id: string, asset: Asset): Asset {
      const assets = this.list(id).filter((entry) => entry.id !== asset.id);
      assets.unshift(asset);
      writeJson(assetsKey(id), assets.slice(0, 60));
      return asset;
    },
    remove(id: string, assetId: string): void {
      writeJson(assetsKey(id), this.list(id).filter((entry) => entry.id !== assetId));
    },
  },
  workspace(id: string) {
    const project = this.projects.get(id);
    if (!project) throw new Error("Project tidak ditemukan.");
    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        stack: project.stack,
        model: project.model,
      },
      files: this.files.all(id).map((file) => ({ path: file.path, content: file.content, encoding: file.encoding })),
      messages: this.messages.list(id),
    };
  },
};
