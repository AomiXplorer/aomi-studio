"use client";

import type { ProjectMeta, StoredMessage, Asset, FileEntry } from "@/lib/workspace/service";
import type { ProjectAnalysis } from "@/lib/services/analysis";
import type { ProviderModel } from "@/lib/ai/types";
import type { AgentEvent } from "@/lib/agent/engine";
import { local, sanitizeClientPath, LocalStorageError } from "@/lib/client/local-store";

/**
 * Whether the browser owns the workspace. Asked once from the server, so the same
 * build works on a host with a persistent disk and on serverless hosts where /tmp
 * is per-instance. A cached promise keeps every call cheap and consistent.
 */
let modePromise: Promise<boolean> | null = null;

export function isClientStorage(): Promise<boolean> {
  if (!modePromise) {
    modePromise = fetch("/api/providers/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { clientStorage?: boolean } | null) => payload?.clientStorage === true)
      .catch(() => false);
  }
  return modePromise;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const error = (payload.error as { message?: string; code?: string }) || {};
    throw new ApiError(error.message || `Permintaan gagal (${res.status})`, res.status, error.code);
  }
  return payload as T;
}

export interface ProviderStatus {
  configured: boolean;
  baseUrl: string;
  defaultModel: string;
  storage: { driver: string; persistent: boolean; note: string };
  chat: { available: boolean; models?: number; error?: string };
  image: { available: boolean; models?: string[]; model?: string; error?: string; note?: string };
  audio: { available: boolean; error?: string; models?: { id: string; voices: number }[]; note?: string };
}

function newProjectId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function fileEntry(file: { path: string; content: string; encoding: "utf8" | "base64" }): FileEntry {
  const size = file.encoding === "utf8" ? new TextEncoder().encode(file.content).length : Math.round((file.content.length * 3) / 4);
  return { path: file.path, size, isText: file.encoding === "utf8" };
}

async function readUpload(file: File): Promise<{ content: string; encoding: "utf8" | "base64" }> {
  const isText = /^text\//.test(file.type) || /\.(md|txt|json|css|js|ts|tsx|jsx|html|svg|yml|yaml)$/i.test(file.name);
  if (isText) return { content: await file.text(), encoding: "utf8" };
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return { content: btoa(binary), encoding: "base64" };
}

export const api = {
  projects: {
    list: async () => {
      if (await isClientStorage()) {
        const templates = await request<{ templates: { id: string; label: string; description: string }[] }>("/api/scaffold", { method: "GET" }).catch(
          () => ({ templates: [] }),
        );
        return { projects: local.projects.list(), templates: templates.templates };
      }
      return request<{ projects: ProjectMeta[]; templates: { id: string; label: string; description: string }[] }>("/api/projects");
    },
    create: async (body: { name: string; template?: string; description?: string; model?: string }) => {
      if (await isClientStorage()) {
        const template = body.template || "blank";
        const scaffold = await request<{ stack: string; files: { path: string; content: string }[] }>("/api/scaffold", {
          method: "POST",
          body: JSON.stringify({ template, name: body.name }),
        });
        const now = new Date().toISOString();
        const project: ProjectMeta = {
          id: newProjectId(),
          name: body.name,
          description: body.description || "",
          stack: scaffold.stack,
          model: body.model || "",
          createdAt: now,
          updatedAt: now,
        };
        local.projects.saveMeta(project);
        local.files.setAll(
          project.id,
          scaffold.files.map((file) => ({ path: file.path, content: file.content, encoding: "utf8" as const, updatedAt: now })),
        );
        local.messages.set(project.id, []);
        return { project };
      }
      return request<{ project: ProjectMeta }>("/api/projects", { method: "POST", body: JSON.stringify(body) });
    },
    get: async (id: string) => {
      if (await isClientStorage()) {
        const project = local.projects.get(id);
        if (!project) throw new ApiError("Project tidak ditemukan.", 404);
        return {
          project,
          storage: { driver: "browser", persistent: true, note: "Workspace disimpan di browser ini." },
        };
      }
      return request<{ project: ProjectMeta; storage: ProviderStatus["storage"] }>(`/api/projects/${id}`);
    },
    update: async (id: string, body: Partial<Pick<ProjectMeta, "name" | "description" | "model" | "stack">>) => {
      if (await isClientStorage()) return { project: local.projects.update(id, body) };
      return request<{ project: ProjectMeta }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    remove: async (id: string) => {
      if (await isClientStorage()) {
        local.projects.remove(id);
        return { ok: true };
      }
      return request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" });
    },
  },
  files: {
    list: async (id: string) => {
      if (await isClientStorage()) return { files: local.files.list(id) };
      return request<{ files: FileEntry[] }>(`/api/projects/${id}/files`);
    },
    read: async (id: string, path: string) => {
      if (await isClientStorage()) return { file: local.files.read(id, path) };
      return request<{ file: { path: string; content: string; encoding: "utf8" | "base64"; size: number; mime: string } }>(
        `/api/projects/${id}/files?path=${encodeURIComponent(path)}`,
      );
    },
    save: async (id: string, path: string, content: string) => {
      if (await isClientStorage()) {
        const result = local.files.write(id, path, content);
        return { ok: true, before: result.before };
      }
      return request<{ ok: boolean; before: string | null }>(`/api/projects/${id}/files`, { method: "PUT", body: JSON.stringify({ path, content }) });
    },
    saveBinary: async (id: string, path: string, dataUrl: string) => {
      if (await isClientStorage()) {
        const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
        local.files.write(id, path, base64, "base64");
        return { ok: true };
      }
      return request<{ ok: boolean }>(`/api/projects/${id}/files`, { method: "PUT", body: JSON.stringify({ path, content: dataUrl, encoding: "base64" }) });
    },
    remove: async (id: string, path: string) => {
      if (await isClientStorage()) {
        local.files.remove(id, path);
        return { ok: true };
      }
      return request<{ ok: boolean }>(`/api/projects/${id}/files`, { method: "DELETE", body: JSON.stringify({ path }) });
    },
    rename: async (id: string, from: string, to: string) => {
      if (await isClientStorage()) {
        local.files.rename(id, from, to);
        return { ok: true };
      }
      return request<{ ok: boolean }>(`/api/projects/${id}/files`, { method: "POST", body: JSON.stringify({ from, to }) });
    },
  },
  messages: {
    list: async (id: string) => {
      if (await isClientStorage()) return { messages: local.messages.list(id) };
      return request<{ messages: StoredMessage[] }>(`/api/projects/${id}/messages`);
    },
  },
  assets: {
    list: async (id: string) => {
      if (await isClientStorage()) return { assets: local.assets.list(id) };
      return request<{ assets: Asset[] }>(`/api/projects/${id}/assets`);
    },
    remove: async (id: string, assetId: string) => {
      if (await isClientStorage()) {
        local.assets.remove(id, assetId);
        return { ok: true };
      }
      return request<{ ok: boolean }>(`/api/projects/${id}/assets?assetId=${assetId}`, { method: "DELETE" });
    },
  },
  analysis: {
    get: async (id: string) => {
      if (await isClientStorage()) {
        return request<{ analysis: ProjectAnalysis }>(`/api/projects/${id}/analyze`, {
          method: "POST",
          body: JSON.stringify({ workspace: local.workspace(id) }),
        });
      }
      return request<{ analysis: ProjectAnalysis }>(`/api/projects/${id}/analyze`);
    },
  },
  models: {
    list: (refresh = false) => request<{ configured: boolean; defaultModel: string; models: ProviderModel[] }>(`/api/models${refresh ? "?refresh=1" : ""}`),
  },
  status: {
    get: async (refresh = false) => {
      return request<ProviderStatus>(`/api/providers/status${refresh ? "?refresh=1" : ""}`);
    },
  },
  voices: {
    list: (refresh = false) => request<{ configured: boolean; defaultVoice: string | null; models: { id: string; tokensPerCharacter: number | null; voices: { id: string; name: string; gender: string | null; accent: string | null; description: string | null }[] }[] }>(`/api/audio/voices${refresh ? "?refresh=1" : ""}`),
  },
  image: {
    generate: async (body: { prompt: string; projectId?: string; aspectRatio?: string; model?: string; saveToProject?: boolean }) => {
      const payload = await request<{ dataUrl: string; model: string; revisedPrompt: string | null; asset: Asset | null }>("/api/image", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if ((await isClientStorage()) && body.saveToProject && body.projectId && payload.asset) {
        local.assets.save(body.projectId, payload.asset);
      }
      return payload;
    },
  },
  audio: {
    generate: async (body: { text: string; projectId?: string; model?: string; voice?: string; format?: string; speed?: number }) => {
      const payload = await request<{ dataUrl: string; mime: string; model: string; voice: string; asset: Asset | null }>("/api/audio", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if ((await isClientStorage()) && body.projectId && payload.asset) {
        local.assets.save(body.projectId, payload.asset);
      }
      return payload;
    },
  },
  upload: async (projectId: string, file: File) => {
    if (await isClientStorage()) {
      if (file.size > 2 * 1024 * 1024) throw new ApiError("Ukuran file melebihi 2 MB.", 413);
      const { content, encoding } = await readUpload(file);
      const path = sanitizeClientPath(`uploads/${file.name}`);
      try {
        local.files.write(projectId, path, content, encoding);
      } catch (error) {
        if (error instanceof LocalStorageError) throw new ApiError(error.message, 507, error.code);
        throw error;
      }
      return { path, name: file.name, size: file.size, type: file.type || "application/octet-stream" };
    }
    const form = new FormData();
    form.append("projectId", projectId);
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const payload = (await res.json()) as { path?: string; name?: string; error?: { message?: string } };
    if (!res.ok) throw new ApiError(payload.error?.message || "Upload gagal", res.status);
    return payload as { path: string; name: string; size: number; type: string };
  },
};

export interface StreamHandlers {
  onEvent: (event: AgentEvent) => void;
  onDone?: () => void;
  onSnapshot?: () => void;
  signal?: AbortSignal;
}

interface SnapshotEvent {
  type: "workspace_snapshot";
  project: ProjectMeta | null;
  files: { path: string; content: string; encoding: "utf8" | "base64" }[];
  messages: StoredMessage[];
}

function applySnapshot(event: SnapshotEvent): void {
  const id = event.project?.id;
  if (!id) return;
  const now = new Date().toISOString();
  try {
    local.files.setAll(
      id,
      event.files.map((file) => ({ path: file.path, content: file.content, encoding: file.encoding, updatedAt: now })),
    );
    local.messages.set(id, event.messages);
    local.projects.saveMeta({ ...(event.project as ProjectMeta), updatedAt: now });
  } catch {
    /* the next save reports a full-storage error to the user */
  }
}

export async function streamChat(
  body: {
    projectId: string;
    message: string;
    model?: string;
    temperature?: number;
    attachments?: { name: string; path: string }[];
    continuation?: boolean;
  },
  handlers: StreamHandlers,
): Promise<void> {
  const payload = (await isClientStorage()) ? { ...body, workspace: local.workspace(body.projectId) } : body;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: handlers.signal,
  });

  if (!res.ok || !res.body) {
    let message = `Permintaan gagal (${res.status})`;
    try {
      const errorPayload = (await res.json()) as { error?: { message?: string } };
      message = errorPayload.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleFrame = (frame: string) => {
    for (const line of frame.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const raw = trimmed.slice(5).trim();
      if (raw === "[DONE]") {
        handlers.onDone?.();
        return true;
      }
      try {
        const event = JSON.parse(raw) as AgentEvent | SnapshotEvent;
        if ((event as SnapshotEvent).type === "workspace_snapshot") {
          applySnapshot(event as SnapshotEvent);
          handlers.onSnapshot?.();
          continue;
        }
        handlers.onEvent(event as AgentEvent);
      } catch {
        /* skip malformed frame */
      }
    }
    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      if (handleFrame(frame)) return;
    }
  }
  handlers.onDone?.();
}
