"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  Download,
  Eye,
  GitCompareArrows,
  MessageSquare,
  PanelLeft,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Badge, Dot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { downloadProjectZip, downloadWorkspaceFile } from "@/lib/client/download";
import { FileTree } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { DiffView } from "./DiffView";
import { api } from "@/lib/client/api";
import type { FileEntry, ProjectMeta } from "@/lib/workspace/service";
import type { ProjectAnalysis } from "@/lib/services/analysis";
import { languageFor } from "@/lib/workspace/paths";
import { cn, formatBytes } from "@/lib/utils";

type SidePanel = "none" | "diff" | "preview" | "checks";

export function WorkspaceView({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [tabs, setTabs] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<SidePanel>("none");
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);

  const dirty = content !== savedContent;

  const loadFiles = useCallback(async () => {
    const result = await api.files.list(projectId);
    setFiles(result.files);
    return result.files;
  }, [projectId]);

  const openFile = useCallback(
    async (path: string) => {
      setError(null);
      setTreeOpen(false);
      try {
        const { file } = await api.files.read(projectId, path);
        if (file.encoding !== "utf8") {
          setActivePath(path);
          setContent("");
          setSavedContent("");
          setError("File biner: hanya bisa diunduh, bukan diedit di editor.");
          setTabs((current) => (current.includes(path) ? current : [...current, path]));
          return;
        }
        setActivePath(path);
        setContent(file.content);
        setSavedContent(file.content);
        setTabs((current) => (current.includes(path) ? current : [...current, path]));
      } catch (readError) {
        setError((readError as Error).message);
      }
    },
    [projectId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ project: loaded }, list] = await Promise.all([api.projects.get(projectId), loadFiles()]);
        if (cancelled) return;
        setProject(loaded);
        const wanted = searchParams.get("path");
        const initial = wanted && list.some((file) => file.path === wanted) ? wanted : list.find((file) => file.path === "README.md")?.path || list[0]?.path;
        if (initial) await openFile(initial);
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadFiles, openFile, searchParams]);

  const save = async () => {
    if (!activePath) return;
    setSaving(true);
    setError(null);
    try {
      await api.files.save(projectId, activePath, content);
      setSavedContent(content);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
      await loadFiles();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (path: string) => {
    if (!window.confirm(`Hapus ${path} dari workspace?`)) return;
    try {
      await api.files.remove(projectId, path);
      setTabs((current) => current.filter((tab) => tab !== path));
      if (activePath === path) {
        setActivePath(null);
        setContent("");
        setSavedContent("");
      }
      await loadFiles();
    } catch (removeError) {
      setError((removeError as Error).message);
    }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setPanel("checks");
    try {
      const { analysis: result } = await api.analysis.get(projectId);
      setAnalysis(result);
    } catch (analysisError) {
      setError((analysisError as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const closeTab = (path: string) => {
    setTabs((current) => current.filter((tab) => tab !== path));
    if (activePath === path) {
      const remaining = tabs.filter((tab) => tab !== path);
      if (remaining.length) void openFile(remaining[remaining.length - 1]);
      else {
        setActivePath(null);
        setContent("");
        setSavedContent("");
      }
    }
  };

  const previewDoc = useMemo(() => {
    if (!activePath || !/\.html?$/i.test(activePath)) return null;
    return content;
  }, [activePath, content]);

  const errorCount = analysis?.checks.filter((check) => check.level === "error").length ?? 0;

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center text-[13px] text-muted lg:h-dvh">
        <Spinner className="mr-2" /> Memuat workspace...
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setTreeOpen((value) => !value)} aria-label="Buka file explorer">
          <PanelLeft className="size-3.5" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-medium text-ink">{project?.name || "Workspace"}</h1>
          <p className="flex items-center gap-1.5 text-[11px] text-faint">
            <Dot tone="neutral" /> {project?.stack} · {files.length} file
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {activePath ? (
            <Button variant="secondary" size="sm" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? <Spinner className="size-3" /> : savedFlash ? <Check className="size-3 text-ok" /> : <Save className="size-3" />}
              {dirty ? "Simpan" : "Tersimpan"}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={runAnalysis} disabled={analyzing}>
            {analyzing ? <Spinner className="size-3" /> : <ShieldCheck className="size-3.5" />} Check
          </Button>
          <Link href={`/chat`} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-muted hover:bg-surface hover:text-ink">
            <MessageSquare className="size-3.5" /> Chat
          </Link>
          <button
            type="button"
            onClick={() => {
              downloadProjectZip(projectId, project?.name || "aomi-project").catch((cause: Error) => setError(cause.message));
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-muted hover:bg-surface hover:text-ink"
          >
            <Download className="size-3.5" /> ZIP
          </button>
        </div>
      </header>

      {error ? (
        <div className="flex items-start gap-2 border-b border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p className="flex-1">{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="Tutup" className="text-danger/70 hover:text-danger">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[236px] shrink-0 border-r border-line lg:block">
          <FileTree files={files} activePath={activePath} onSelect={(path) => void openFile(path)} onDelete={(path) => void remove(path)} />
        </div>

        {treeOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/70" onClick={() => setTreeOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[260px] border-r border-line bg-panel pt-14">
              <FileTree files={files} activePath={activePath} onSelect={(path) => void openFile(path)} onDelete={(path) => void remove(path)} />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-1.5 py-1">
            {tabs.length === 0 ? <span className="px-2 py-1 text-[12px] text-faint">Pilih file untuk dibuka</span> : null}
            {tabs.map((tab) => (
              <div
                key={tab}
                className={cn(
                  "group flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors",
                  activePath === tab ? "bg-surface text-ink" : "text-muted hover:bg-surface/50",
                )}
              >
                <button type="button" onClick={() => void openFile(tab)} className="max-w-[180px] truncate font-mono">
                  {tab.split("/").pop()}
                  {tab === activePath && dirty ? <span className="ml-1 text-accent">*</span> : null}
                </button>
                <button type="button" onClick={() => closeTab(tab)} aria-label={`Tutup ${tab}`} className="text-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100">
                  <X className="size-3" />
                </button>
              </div>
            ))}

            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <Button variant="ghost" size="sm" onClick={() => setPanel(panel === "diff" ? "none" : "diff")} aria-label="Diff" title="Diff vs tersimpan">
                <GitCompareArrows className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPanel(panel === "preview" ? "none" : "preview")}
                aria-label="Preview"
                title="Preview HTML"
                disabled={!previewDoc}
              >
                <Eye className="size-3.5" />
              </Button>
              {activePath ? (
                <Button variant="ghost" size="sm" onClick={() => void remove(activePath)} aria-label="Hapus file" title="Hapus file">
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className={cn("flex min-h-0 flex-1", panel !== "none" && "lg:gap-0")}>
            <div className="min-w-0 flex-1 overflow-hidden">
              {activePath && content !== "" ? (
                <CodeEditor value={content} language={languageFor(activePath)} onChange={setContent} readOnly={false} />
              ) : activePath ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[12.5px] text-muted">
                  <AlertCircle className="size-4 text-warn" aria-hidden />
                  <p>{error || "File ini tidak bisa ditampilkan sebagai teks."}</p>
                  <button
                    type="button"
                    onClick={() => {
                      downloadWorkspaceFile(projectId, activePath).catch((cause: Error) => setError(cause.message));
                    }}
                    className="text-accent hover:underline"
                  >
                    Unduh file
                  </button>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <p className="text-[13px] text-muted">Workspace siap. Minta Aomi menulis file lewat Chat.</p>
                  <Link href="/chat" className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12.5px] text-ink-dim hover:border-line-strong hover:text-ink">
                    <MessageSquare className="size-3.5" /> Buka Chat
                  </Link>
                </div>
              )}
            </div>

            {panel !== "none" ? (
              <div className="hidden w-[46%] max-w-[620px] shrink-0 border-l border-line lg:block">
                <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                    {panel === "diff" ? "diff vs tersimpan" : panel === "preview" ? "preview html" : "project checks"}
                  </span>
                  <button type="button" onClick={() => setPanel("none")} aria-label="Tutup panel" className="text-faint hover:text-ink">
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="h-[calc(100%-33px)] overflow-hidden">
                  {panel === "diff" ? (
                    <DiffView before={savedContent} after={content} />
                  ) : panel === "preview" ? (
                    <iframe title="Preview" srcDoc={previewDoc || ""} sandbox="" className="h-full w-full bg-white" />
                  ) : (
                    <ChecksPanel analysis={analysis} running={analyzing} onRefresh={runAnalysis} />
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 border-t border-line px-3 py-1.5 text-[11px] text-faint">
            {activePath ? (
              <>
                <span className="truncate font-mono">{activePath}</span>
                <span>·</span>
                <span>{formatBytes(content.length)}</span>
                <span>·</span>
                <span>{content.split("\n").length} baris</span>
              </>
            ) : (
              <span>Belum ada file aktif</span>
            )}
            {analysis ? (
              <span className="ml-auto flex items-center gap-1.5">
                {errorCount ? <Badge tone="danger">{errorCount} error</Badge> : <Badge tone="ok">static check clear</Badge>}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChecksPanel({ analysis, running, onRefresh }: { analysis: ProjectAnalysis | null; running: boolean; onRefresh: () => void }) {
  if (running) {
    return (
      <div className="flex items-center gap-2 p-4 text-[12.5px] text-muted">
        <Spinner /> Menganalisis project...
      </div>
    );
  }
  if (!analysis) {
    return (
      <div className="p-4">
        <p className="text-[12.5px] text-muted">Belum ada hasil. Jalankan pemeriksaan statis project.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRefresh}>
          <RefreshCw className="size-3" /> Jalankan
        </Button>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto p-3">
      <dl className="mb-3 grid grid-cols-2 gap-2 text-[12px]">
        {[
          ["Stack", analysis.stack],
          ["File", String(analysis.files)],
          ["Ukuran", formatBytes(analysis.totalBytes)],
          ["Entrypoint", String(analysis.entrypoints.length)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-line bg-panel px-2 py-1.5">
            <dt className="text-[10.5px] uppercase tracking-[0.1em] text-faint">{label}</dt>
            <dd className="truncate text-ink-dim">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.12em] text-faint">Temuan</p>
      {analysis.checks.length === 0 ? (
        <p className="rounded-md border border-ok/30 bg-ok/10 px-2 py-1.5 text-[12px] text-ok">Tidak ada masalah terdeteksi.</p>
      ) : (
        <ul className="space-y-1">
          {analysis.checks.map((check, index) => (
            <li
              key={`${check.message}-${index}`}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[12px]",
                check.level === "error" && "border-danger/30 bg-danger/10 text-danger",
                check.level === "warning" && "border-warn/30 bg-warn/10 text-warn",
                check.level === "info" && "border-line bg-panel text-muted",
              )}
            >
              {check.message}
              {check.file ? <span className="ml-1 font-mono text-[11px] opacity-80">({check.file})</span> : null}
            </li>
          ))}
        </ul>
      )}

      {analysis.todos.length ? (
        <>
          <p className="mb-1.5 mt-3 text-[10.5px] uppercase tracking-[0.12em] text-faint">TODO</p>
          <ul className="space-y-0.5 font-mono text-[11.5px] text-muted">
            {analysis.todos.slice(0, 12).map((todo) => (
              <li key={`${todo.file}-${todo.line}`} className="truncate">
                {todo.file}:{todo.line} {todo.text}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mb-1.5 mt-3 text-[10.5px] uppercase tracking-[0.12em] text-faint">Struktur</p>
      <pre className="overflow-x-auto rounded-md border border-line bg-panel px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted">
        {analysis.tree}
      </pre>
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Ini pemeriksaan statis (import relatif, JSON, kurung, file kosong). Bukan build production.
      </p>
    </div>
  );
}
