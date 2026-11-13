"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Download,
  FileCode2,
  FolderOpen,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Badge, Dot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { Markdown } from "./Markdown";
import { ToolTimeline, type ToolEntry } from "./ToolTimeline";
import { StatusRail } from "./StatusRail";
import { Composer, type PendingAttachment } from "./Composer";
import { api, streamChat } from "@/lib/client/api";
import type { AgentEvent, AgentStatus } from "@/lib/agent/engine";
import type { ProjectMeta, StoredMessage } from "@/lib/workspace/service";
import type { FileChange } from "@/lib/agent/tools/types";
import type { ProviderModel } from "@/lib/ai/types";
import { cn, formatNumber } from "@/lib/utils";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  tools?: ToolEntry[];
  streaming?: boolean;
  usage?: { billedTokens: number } | null;
  attachments?: { name: string; path: string }[];
}

const EXAMPLES = [
  "Buatkan website portfolio programmer dengan halaman project dan kontak.",
  "Buatkan company profile statis untuk studio desain, gaya editorial.",
  "Buatkan game visual novel sederhana bertema kehidupan sekolah.",
  "Buatkan CLI TypeScript yang membaca CSV dan mencetak ringkasannya.",
];

export function ChatView() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [templates, setTemplates] = useState<{ id: string; label: string; description: string }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [openChange, setOpenChange] = useState<FileChange | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("nextjs");
  const [creating, setCreating] = useState(false);
  const [sessionBilled, setSessionBilled] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeProject = useMemo(() => projects.find((project) => project.id === activeId) || null, [projects, activeId]);

  const loadMessages = useCallback(async (projectId: string) => {
    const { messages: stored } = await api.messages.list(projectId);
    setMessages(
      stored
        .filter((message: StoredMessage) => message.role !== "system")
        .map((message) => ({
          id: message.id,
          role: message.role as "user" | "assistant",
          content: message.content,
          createdAt: message.createdAt,
          usage: message.usage ? { billedTokens: message.usage.billedTokens } : null,
          attachments: message.attachments,
          tools: (message.toolCalls || []).map((tool, index) => ({
            id: `${message.id}-${index}`,
            name: tool.name,
            status: tool.status === "success" ? ("ok" as const) : ("error" as const),
            summary: tool.summary,
            args: tool.args,
          })),
        })),
    );
  }, []);

  const selectProject = useCallback(
    async (projectId: string) => {
      setActiveId(projectId);
      window.localStorage.setItem("aomi:project", projectId);
      setChanges([]);
      await loadMessages(projectId);
    },
    [loadMessages],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projectsRes, modelsRes] = await Promise.all([api.projects.list(), api.models.list().catch(() => ({ configured: false, defaultModel: "", models: [] as ProviderModel[] }))]);
        if (cancelled) return;
        setProjects(projectsRes.projects);
        setTemplates(projectsRes.templates);
        setModels(modelsRes.models);
        const textModels = modelsRes.models.filter((item) => item.kind === "text");
        const stored = window.localStorage.getItem("aomi:model");
        const preferred = stored && textModels.some((item) => item.id === stored) ? stored : modelsRes.defaultModel || textModels[0]?.id || "";
        setModel(preferred);

        const remembered = window.localStorage.getItem("aomi:project");
        const initial = projectsRes.projects.find((project) => project.id === remembered) || projectsRes.projects[0];
        if (initial) {
          setActiveId(initial.id);
          await loadMessages(initial.id);
        }
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  const createProject = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { project } = await api.projects.create({ name: newName.trim(), template: newTemplate, model });
      setProjects((current) => [project, ...current]);
      setShowNew(false);
      setNewName("");
      await selectProject(project.id);
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleEvent = (event: AgentEvent) => {
    if (event.type === "status") {
      setStatus(event.status);
      setStatusDetail(event.detail || "");
    } else if (event.type === "text") {
      setMessages((current) =>
        current.map((message) => (message.id === "live" ? { ...message, content: message.content + event.delta } : message)),
      );
    } else if (event.type === "tool_start") {
      setMessages((current) =>
        current.map((message) =>
          message.id === "live"
            ? {
                ...message,
                tools: [
                  ...(message.tools || []),
                  { id: event.id, name: event.name, status: "running" as const, summary: "menjalankan...", args: event.args },
                ],
              }
            : message,
        ),
      );
    } else if (event.type === "tool_end") {
      setMessages((current) =>
        current.map((message) =>
          message.id === "live"
            ? {
                ...message,
                tools: (message.tools || []).map((tool) =>
                  tool.id === event.id ? { ...tool, status: event.ok ? ("ok" as const) : ("error" as const), summary: event.summary } : tool,
                ),
              }
            : message,
        ),
      );
    } else if (event.type === "file_changed") {
      setChanges((current) => {
        const next = current.filter((change) => change.path !== event.change.path);
        return [...next, event.change];
      });
    } else if (event.type === "usage") {
      setSessionBilled((value) => value + event.usage.billedTokens);
    } else if (event.type === "error") {
      setError(event.message);
    }
  };

  const send = async (text: string) => {
    if (!activeProject) {
      setShowNew(true);
      return;
    }
    setError(null);
    setStatus("thinking");
    setStatusDetail("");
    setStreaming(true);
    setChanges([]);
    const now = new Date().toISOString();
    setMessages((current) => [
      ...current,
      { id: `user-${now}`, role: "user", content: text, createdAt: now, attachments: attachments.map((file) => ({ name: file.name, path: file.path })) },
      { id: "live", role: "assistant", content: "", createdAt: now, tools: [], streaming: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        {
          projectId: activeProject.id,
          message: text,
          model: model || undefined,
          attachments: attachments.map((file) => ({ name: file.name, path: file.path })),
        },
        { onEvent: handleEvent, signal: controller.signal },
      );
      await loadMessages(activeProject.id);
      setProjects((current) =>
        current.map((project) => (project.id === activeProject.id ? { ...project, updatedAt: new Date().toISOString() } : project)),
      );
    } catch (sendError) {
      if ((sendError as Error).name !== "AbortError") setError((sendError as Error).message);
      await loadMessages(activeProject.id).catch(() => undefined);
    } finally {
      setStreaming(false);
      setAttachments([]);
      abortRef.current = null;
      setTimeout(() => setStatus(null), 1200);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const attach = async (file: File) => {
    if (!activeProject) {
      setShowNew(true);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await api.upload(activeProject.id, file);
      setAttachments((current) => [...current, { name: result.name, path: result.path, size: result.size }]);
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const textModels = models.filter((item) => item.kind === "text");

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Select
            aria-label="Pilih project"
            value={activeId || ""}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "__new") {
                setShowNew(true);
                return;
              }
              if (value) void selectProject(value);
            }}
            className="h-8 w-[190px] text-[12.5px]"
          >
            {projects.length === 0 ? <option value="">Belum ada project</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
            <option value="__new">+ Project baru</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setShowNew(true)} aria-label="Project baru">
            <Plus className="size-3.5" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {activeProject ? (
            <>
              <Link
                href={`/projects/${activeProject.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <FolderOpen className="size-3.5" /> Workspace
              </Link>
              <a
                href={`/api/projects/${activeProject.id}/export`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <Download className="size-3.5" /> ZIP
              </a>
            </>
          ) : null}
          <Select
            aria-label="Pilih model"
            value={model}
            onChange={(event) => {
              setModel(event.target.value);
              window.localStorage.setItem("aomi:model", event.target.value);
            }}
            className="h-8 w-[168px] text-[12.5px]"
          >
            {textModels.length === 0 ? <option value="">Model belum tersedia</option> : null}
            {textModels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {item.tier ? ` · ${item.tier}` : ""}
              </option>
            ))}
          </Select>
        </div>
      </header>

      {changes.length ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-panel/60 px-4 py-2">
          <span className="mr-1 flex items-center gap-1.5 text-[11.5px] text-muted">
            <FileCode2 className="size-3.5 text-accent" /> {changes.length} file berubah
          </span>
          {changes.slice(-6).map((change) => (
            <button
              key={change.path}
              type="button"
              onClick={() => setOpenChange(change)}
              className="max-w-[220px] truncate rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-dim hover:border-line-strong"
            >
              {change.path}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-5">
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Spinner /> Memuat workspace...
            </div>
          ) : messages.length === 0 ? (
            <div className="py-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">Aomi</p>
              <h1 className="mt-2 text-[22px] font-medium leading-snug tracking-tight text-ink">
                Jelaskan yang ingin dibangun. Aomi yang menulis filenya.
              </h1>
              <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">
                Setiap pekerjaan berjalan di workspace project ini: file dibuat sungguhan, perubahan bisa dilihat, dan hasilnya bisa diunduh sebagai ZIP.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => void send(example)}
                    className="group flex items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2.5 text-left text-[12.5px] leading-relaxed text-ink-dim transition-colors hover:border-line-strong hover:bg-surface"
                  >
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-faint group-hover:text-accent" aria-hidden />
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-6">
              {messages.map((message) => (
                <li key={message.id}>
                  {message.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg rounded-br-sm border border-line bg-surface px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        {message.attachments?.length ? (
                          <p className="mt-1.5 font-mono text-[11px] text-faint">{message.attachments.map((file) => file.path).join(", ")}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="font-mono text-[11px] lowercase tracking-tight text-ink">aomi</span>
                        <span className="size-1 rounded-full bg-accent" aria-hidden />
                        {message.usage ? (
                          <span className="font-mono text-[10.5px] text-faint">{formatNumber(message.usage.billedTokens)} token</span>
                        ) : null}
                      </div>
                      {message.content ? <Markdown content={message.content} /> : null}
                      {message.tools?.length ? <ToolTimeline tools={message.tools} /> : null}
                      {message.streaming && !message.content && !message.tools?.length ? (
                        <p className="flex items-center gap-2 text-[13px] text-muted">
                          <Spinner /> Menyiapkan langkah pertama...
                        </p>
                      ) : null}
                      {message.streaming && message.content ? <span className="aomi-caret" aria-hidden /> : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[12.5px] text-danger">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <p className="flex-1">{error}</p>
              <button type="button" onClick={() => setError(null)} aria-label="Tutup" className="text-danger/70 hover:text-danger">
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-line bg-panel/40">
        <StatusRail status={status} detail={statusDetail} />
        {sessionBilled > 0 ? (
          <div className="flex items-center gap-2 px-4 pb-1 pt-1.5 text-[11px] text-faint">
            <Dot tone="neutral" /> Sesi ini: {formatNumber(sessionBilled)} token ditagihkan provider
          </div>
        ) : null}
      </div>

      <Composer
        onSend={(text) => void send(text)}
        onStop={stop}
        streaming={streaming}
        attachments={attachments}
        onAttach={(file) => void attach(file)}
        onRemoveAttachment={(path) => setAttachments((current) => current.filter((file) => file.path !== path))}
        uploading={uploading}
        disabled={loading}
        placeholder={activeProject ? `Minta Aomi mengerjakan sesuatu di "${activeProject.name}"...` : "Buat project dulu untuk mulai..."}
      />

      {showNew ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/70" onClick={() => setShowNew(false)} />
          <div className="relative w-full max-w-md rounded-xl border border-line bg-panel p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-[15px] font-medium text-ink">Project baru</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">Workspace terisolasi dengan file sungguhan.</p>
              </div>
              <button type="button" onClick={() => setShowNew(false)} aria-label="Tutup" className="text-faint hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint" htmlFor="project-name">
              Nama project
            </label>
            <Input
              id="project-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Portfolio programmer"
              onKeyDown={(event) => {
                if (event.key === "Enter") void createProject();
              }}
            />
            <label className="mb-1.5 mt-3 block text-[11px] font-medium uppercase tracking-[0.14em] text-faint" htmlFor="project-template">
              Template
            </label>
            <Select id="project-template" value={newTemplate} onChange={(event) => setNewTemplate(event.target.value)}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label} — {template.description}
                </option>
              ))}
            </Select>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>
                Batal
              </Button>
              <Button variant="primary" onClick={() => void createProject()} disabled={!newName.trim() || creating}>
                {creating ? <Spinner className="size-3.5" /> : null} Buat project
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {openChange ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
          <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/70" onClick={() => setOpenChange(null)} />
          <div className="relative flex max-h-[85dvh] w-full max-w-3xl flex-col rounded-xl border border-line bg-panel">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <FileCode2 className="size-4 text-accent" aria-hidden />
              <span className="truncate font-mono text-[12.5px] text-ink">{openChange.path}</span>
              <Badge tone={openChange.after === null ? "danger" : openChange.before === null ? "ok" : "accent"} className="ml-1">
                {openChange.after === null ? "deleted" : openChange.before === null ? "created" : "modified"}
              </Badge>
              <button type="button" onClick={() => setOpenChange(null)} aria-label="Tutup" className="ml-auto text-faint hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.6] text-ink-dim">
                {openChange.after ?? "(dihapus)"}
              </pre>
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11.5px] text-faint">
              <span>{openChange.after ? `${openChange.after.split("\n").length} baris` : "file dihapus"}</span>
              {activeProject ? (
                <Link href={`/projects/${activeProject.id}?path=${encodeURIComponent(openChange.path)}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                  Buka di workspace <ArrowUpRight className="size-3" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
