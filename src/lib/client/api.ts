"use client";

import type { ProjectMeta, StoredMessage, Asset, FileEntry } from "@/lib/workspace/service";
import type { ProjectAnalysis } from "@/lib/services/analysis";
import type { ProviderModel } from "@/lib/ai/types";
import type { AgentEvent } from "@/lib/agent/engine";

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

export const api = {
  projects: {
    list: () => request<{ projects: ProjectMeta[]; templates: { id: string; label: string; description: string }[] }>("/api/projects"),
    create: (body: { name: string; template?: string; description?: string; model?: string }) =>
      request<{ project: ProjectMeta }>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string) => request<{ project: ProjectMeta; storage: ProviderStatus["storage"] }>(`/api/projects/${id}`),
    update: (id: string, body: Partial<Pick<ProjectMeta, "name" | "description" | "model" | "stack">>) =>
      request<{ project: ProjectMeta }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  },
  files: {
    list: (id: string) => request<{ files: FileEntry[] }>(`/api/projects/${id}/files`),
    read: (id: string, path: string) =>
      request<{ file: { path: string; content: string; encoding: "utf8" | "base64"; size: number; mime: string } }>(
        `/api/projects/${id}/files?path=${encodeURIComponent(path)}`,
      ),
    save: (id: string, path: string, content: string) =>
      request<{ ok: boolean; before: string | null }>(`/api/projects/${id}/files`, { method: "PUT", body: JSON.stringify({ path, content }) }),
    saveBinary: (id: string, path: string, dataUrl: string) =>
      request<{ ok: boolean }>(`/api/projects/${id}/files`, { method: "PUT", body: JSON.stringify({ path, content: dataUrl, encoding: "base64" }) }),
    remove: (id: string, path: string) =>
      request<{ ok: boolean }>(`/api/projects/${id}/files`, { method: "DELETE", body: JSON.stringify({ path }) }),
    rename: (id: string, from: string, to: string) =>
      request<{ ok: boolean }>(`/api/projects/${id}/files`, { method: "POST", body: JSON.stringify({ from, to }) }),
  },
  messages: {
    list: (id: string) => request<{ messages: StoredMessage[] }>(`/api/projects/${id}/messages`),
  },
  assets: {
    list: (id: string) => request<{ assets: Asset[] }>(`/api/projects/${id}/assets`),
    remove: (id: string, assetId: string) => request<{ ok: boolean }>(`/api/projects/${id}/assets?assetId=${assetId}`, { method: "DELETE" }),
  },
  analysis: {
    get: (id: string) => request<{ analysis: ProjectAnalysis }>(`/api/projects/${id}/analyze`),
  },
  models: {
    list: (refresh = false) => request<{ configured: boolean; defaultModel: string; models: ProviderModel[] }>(`/api/models${refresh ? "?refresh=1" : ""}`),
  },
  status: {
    get: (refresh = false) => request<ProviderStatus>(`/api/providers/status${refresh ? "?refresh=1" : ""}`),
  },
  voices: {
    list: (refresh = false) => request<{ configured: boolean; defaultVoice: string | null; models: { id: string; tokensPerCharacter: number | null; voices: { id: string; name: string; gender: string | null; accent: string | null; description: string | null }[] }[] }>(`/api/audio/voices${refresh ? "?refresh=1" : ""}`),
  },
  image: {
    generate: (body: { prompt: string; projectId?: string; aspectRatio?: string; model?: string; saveToProject?: boolean }) =>
      request<{ dataUrl: string; model: string; revisedPrompt: string | null; asset: Asset | null }>("/api/image", { method: "POST", body: JSON.stringify(body) }),
  },
  audio: {
    generate: (body: { text: string; projectId?: string; model?: string; voice?: string; format?: string; speed?: number }) =>
      request<{ dataUrl: string; mime: string; model: string; voice: string; asset: Asset | null }>("/api/audio", { method: "POST", body: JSON.stringify(body) }),
  },
  upload: async (projectId: string, file: File) => {
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
  signal?: AbortSignal;
}

export async function streamChat(
  body: { projectId: string; message: string; model?: string; temperature?: number; attachments?: { name: string; path: string }[] },
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });

  if (!res.ok || !res.body) {
    let message = `Permintaan gagal (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: { message?: string } };
      message = payload.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      for (const line of frame.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          handlers.onDone?.();
          return;
        }
        try {
          handlers.onEvent(JSON.parse(payload) as AgentEvent);
        } catch {
          /* skip malformed frame */
        }
      }
    }
  }
  handlers.onDone?.();
}
