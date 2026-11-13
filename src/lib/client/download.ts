"use client";

import { isClientStorage } from "./api";
import { local } from "./local-store";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "aomi-project"
  );
}

/** Downloads the project ZIP from whichever side actually holds the files. */
export async function downloadProjectZip(projectId: string, name: string): Promise<void> {
  if (!(await isClientStorage())) {
    window.location.href = `/api/projects/${projectId}/export`;
    return;
  }
  const res = await fetch(`/api/projects/${projectId}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace: local.workspace(projectId) }),
  });
  if (!res.ok) {
    let message = `Gagal membuat ZIP (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: { message?: string } };
      message = payload.error?.message || message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  triggerDownload(await res.blob(), `${slugify(name)}.zip`);
}

/** Downloads a single file, reading it locally when the browser owns it. */
export async function downloadWorkspaceFile(projectId: string, path: string): Promise<void> {
  if (!(await isClientStorage())) {
    window.location.href = `/api/projects/${projectId}/files?path=${encodeURIComponent(path)}&download=1`;
    return;
  }
  const file = local.files.read(projectId, path);
  const blob =
    file.encoding === "utf8" ? new Blob([file.content], { type: "text/plain;charset=utf-8" }) : base64ToBlob(file.content, file.mime);
  triggerDownload(blob, path.split("/").pop() || "file");
}
