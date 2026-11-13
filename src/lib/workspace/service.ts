import { randomUUID } from "node:crypto";
import { getStore, readJson, readText, writeJson, writeText } from "./store";
import { isTextPath, MAX_FILE_BYTES, MAX_TOTAL_FILES, sanitizeRelPath, WorkspacePathError } from "./paths";
import type { TokenUsage } from "@/lib/ai/types";

export interface ProjectMeta {
  id: string;
  name: string;
  description: string;
  stack: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredToolCall {
  name: string;
  status: "success" | "error";
  summary: string;
  args?: Record<string, unknown>;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  model?: string;
  usage?: TokenUsage | null;
  toolCalls?: StoredToolCall[];
  attachments?: { name: string; path: string }[];
  status?: "completed" | "failed" | "aborted";
}

export interface Asset {
  id: string;
  kind: "image" | "audio";
  name: string;
  mime: string;
  dataUrl: string;
  prompt: string;
  model: string;
  voice?: string;
  createdAt: string;
}

export interface FileEntry {
  path: string;
  size: number;
  isText: boolean;
}

const INDEX_KEY = "projects/index.json";
const metaKey = (id: string) => `projects/${id}/meta.json`;
const messagesKey = (id: string) => `projects/${id}/messages.json`;
const assetsKey = (id: string) => `projects/${id}/assets.json`;
const fileKey = (id: string, path: string) => `projects/${id}/files/${path}`;
const filesPrefix = (id: string) => `projects/${id}/files/`;

export function assertProjectId(id: string): string {
  if (!/^[a-z0-9-]{6,64}$/i.test(id)) throw new WorkspacePathError("ID project tidak valid.");
  return id;
}

const locks = new Map<string, Promise<unknown>>();

/** Serialises read-modify-write sequences per key inside one process. */
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  locks.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const index = await readJson<ProjectMeta[]>(INDEX_KEY, []);
  return index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<ProjectMeta | null> {
  return readJson<ProjectMeta | null>(metaKey(assertProjectId(id)), null);
}

export async function saveProject(meta: ProjectMeta): Promise<ProjectMeta> {
  assertProjectId(meta.id);
  await withLock(INDEX_KEY, async () => {
    const index = await readJson<ProjectMeta[]>(INDEX_KEY, []);
    const next = index.filter((item) => item.id !== meta.id);
    next.unshift(meta);
    await writeJson(INDEX_KEY, next.slice(0, 200));
  });
  await writeJson(metaKey(meta.id), meta);
  return meta;
}

export async function createProject(input: {
  name: string;
  description?: string;
  stack?: string;
  model: string;
  files?: Record<string, string>;
}): Promise<ProjectMeta> {
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    id: randomUUID(),
    name: input.name.trim().slice(0, 80) || "Untitled project",
    description: (input.description || "").slice(0, 400),
    stack: input.stack || "blank",
    model: input.model,
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(meta);
  if (input.files) {
    for (const [path, content] of Object.entries(input.files)) {
      await writeProjectFile(meta.id, path, content);
    }
  }
  return meta;
}

export async function touchProject(id: string, patch: Partial<ProjectMeta> = {}): Promise<ProjectMeta> {
  const existing = await getProject(id);
  if (!existing) throw new Error("Project tidak ditemukan.");
  const updated: ProjectMeta = { ...existing, ...patch, id: existing.id, updatedAt: new Date().toISOString() };
  return saveProject(updated);
}

export async function deleteProject(id: string): Promise<void> {
  assertProjectId(id);
  const store = getStore();
  for (const key of await store.list(`projects/${id}/`)) {
    await store.delete(key);
  }
  await withLock(INDEX_KEY, async () => {
    const index = await readJson<ProjectMeta[]>(INDEX_KEY, []);
    await writeJson(INDEX_KEY, index.filter((item) => item.id !== id));
  });
}

export async function listProjectFiles(id: string): Promise<FileEntry[]> {
  assertProjectId(id);
  const prefix = filesPrefix(id);
  const keys = await getStore().list(prefix);
  const entries: FileEntry[] = [];
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const path = key.slice(prefix.length);
    if (!path) continue;
    const bytes = await getStore().get(key);
    entries.push({ path, size: bytes?.byteLength ?? 0, isText: isTextPath(path) });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export interface FileReadResult {
  path: string;
  encoding: "utf8" | "base64";
  content: string;
  size: number;
  mime: string;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", ico: "image/x-icon", pdf: "application/pdf",
};

export function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return MIME_BY_EXT[ext] || (isTextPath(path) ? "text/plain; charset=utf-8" : "application/octet-stream");
}

export async function readProjectFile(id: string, rawPath: string): Promise<FileReadResult | null> {
  const path = sanitizeRelPath(rawPath);
  const bytes = await getStore().get(fileKey(assertProjectId(id), path));
  if (!bytes) return null;
  const text = isTextPath(path);
  return {
    path,
    encoding: text ? "utf8" : "base64",
    content: text ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString("base64"),
    size: bytes.byteLength,
    mime: mimeForPath(path),
  };
}

export async function readProjectText(id: string, rawPath: string): Promise<string | null> {
  const file = await readProjectFile(id, rawPath);
  if (!file) return null;
  return file.encoding === "utf8" ? file.content : "";
}

export async function writeProjectFile(id: string, rawPath: string, content: string | Uint8Array): Promise<{ path: string; size: number; created: boolean }> {
  const path = sanitizeRelPath(rawPath);
  const projectId = assertProjectId(id);
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new WorkspacePathError(`File melebihi batas ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  }
  const existing = await listProjectFiles(projectId);
  if (!existing.some((entry) => entry.path === path) && existing.length >= MAX_TOTAL_FILES) {
    throw new WorkspacePathError(`Workspace sudah mencapai batas ${MAX_TOTAL_FILES} file.`);
  }
  const created = !existing.some((entry) => entry.path === path);
  await getStore().put(fileKey(projectId, path), bytes, mimeForPath(path));
  await touchProject(projectId);
  return { path, size: bytes.byteLength, created };
}

export async function deleteProjectFile(id: string, rawPath: string): Promise<void> {
  const path = sanitizeRelPath(rawPath);
  await getStore().delete(fileKey(assertProjectId(id), path));
  await touchProject(id);
}

export async function renameProjectFile(id: string, from: string, to: string): Promise<{ from: string; to: string }> {
  const source = sanitizeRelPath(from);
  const target = sanitizeRelPath(to);
  const file = await readProjectFile(id, source);
  if (!file) throw new Error(`File ${source} tidak ditemukan.`);
  const bytes = file.encoding === "utf8" ? new TextEncoder().encode(file.content) : Buffer.from(file.content, "base64");
  await getStore().put(fileKey(assertProjectId(id), target), new Uint8Array(bytes), mimeForPath(target));
  await getStore().delete(fileKey(id, source));
  await touchProject(id);
  return { from: source, to: target };
}

export async function searchProjectFiles(
  id: string,
  query: string,
  options: { caseSensitive?: boolean; maxResults?: number } = {},
): Promise<{ path: string; line: number; text: string }[]> {
  const needle = options.caseSensitive ? query : query.toLowerCase();
  const limit = Math.min(options.maxResults ?? 60, 200);
  const results: { path: string; line: number; text: string }[] = [];
  for (const entry of await listProjectFiles(id)) {
    if (!entry.isText) continue;
    const content = await readProjectText(id, entry.path);
    if (!content) continue;
    const lines = content.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const haystack = options.caseSensitive ? lines[index] : lines[index].toLowerCase();
      if (haystack.includes(needle)) {
        results.push({ path: entry.path, line: index + 1, text: lines[index].trim().slice(0, 240) });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

export async function getMessages(id: string): Promise<StoredMessage[]> {
  return readJson<StoredMessage[]>(messagesKey(assertProjectId(id)), []);
}

export async function appendMessage(id: string, message: StoredMessage): Promise<void> {
  const projectId = assertProjectId(id);
  await withLock(messagesKey(projectId), async () => {
    const messages = await getMessages(projectId);
    messages.push(message);
    await writeJson(messagesKey(projectId), messages.slice(-400));
  });
}

export async function replaceMessages(id: string, messages: StoredMessage[]): Promise<void> {
  await writeJson(messagesKey(assertProjectId(id)), messages.slice(-400));
}

export async function listAssets(id: string): Promise<Asset[]> {
  return readJson<Asset[]>(assetsKey(assertProjectId(id)), []);
}

export async function saveAsset(id: string, asset: Asset): Promise<Asset> {
  const projectId = assertProjectId(id);
  await withLock(assetsKey(projectId), async () => {
    const assets = await readJson<Asset[]>(assetsKey(projectId), []);
    const next = [asset, ...assets.filter((item) => item.id !== asset.id)].slice(0, 120);
    await writeJson(assetsKey(projectId), next);
  });
  return asset;
}

export async function deleteAsset(id: string, assetId: string): Promise<void> {
  const projectId = assertProjectId(id);
  await withLock(assetsKey(projectId), async () => {
    const assets = await readJson<Asset[]>(assetsKey(projectId), []);
    await writeJson(assetsKey(projectId), assets.filter((item) => item.id !== assetId));
  });
}

export function newId(): string {
  return randomUUID();
}

export async function readProjectManifest(id: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await listProjectFiles(id)) {
    if (!entry.isText || entry.size > 200_000) continue;
    const content = await readProjectText(id, entry.path);
    if (content !== null) files[entry.path] = content;
  }
  return files;
}

export { readText, writeText };
