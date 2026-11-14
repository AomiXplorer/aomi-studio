"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Download, FolderClosed, FolderOpen, Plus, Trash2 } from "lucide-react";
import type { ProjectMeta } from "@/lib/workspace/service";
import { cn } from "@/lib/utils";

/**
 * The one context bar above the conversation: which project you are in, and the two
 * things you can do with it. The project list opens as a popup instead of a native
 * <select>, so the bar reads the same on every platform.
 */
export function ChatHeader({
  projects,
  activeId,
  activeProject,
  onSelect,
  onNew,
  onZip,
  onClear,
  canClear,
  clearing,
}: {
  projects: ProjectMeta[];
  activeId: string | null;
  activeProject: ProjectMeta | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onZip: () => void;
  onClear: () => void;
  canClear: boolean;
  clearing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !confirm) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target)) setOpen(false);
      if (!confirmRef.current?.contains(target)) setConfirm(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setConfirm(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, confirm]);

  const action = "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted transition-colors duration-150 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-1 border-b border-line/80 bg-bg/80 px-2.5 backdrop-blur-xl sm:px-5">
      <div className="relative min-w-0" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Project: ${activeProject?.name ?? "belum ada"}. Ganti project`}
          className="group flex h-8 min-w-0 items-center gap-2 rounded-lg px-2 text-[13px] transition-colors duration-150 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <FolderClosed className="size-4 shrink-0 text-muted transition-colors group-hover:text-ink" aria-hidden />
          <span className="max-w-[38vw] truncate font-medium text-ink sm:max-w-[280px]">
            {activeProject?.name ?? "Belum ada project"}
          </span>
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-faint transition-transform duration-150", open && "rotate-180")}
            aria-hidden
          />
        </button>

        {open ? (
          <div
            role="listbox"
            aria-label="Daftar project"
            className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(320px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-panel/95 p-1 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.6)] backdrop-blur-xl"
          >
            <p className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">project</p>
            <ul className="max-h-[46vh] overflow-y-auto">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={project.id === activeId}
                    onClick={() => {
                      setOpen(false);
                      if (project.id !== activeId) onSelect(project.id);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors duration-150",
                      project.id === activeId ? "bg-surface text-ink" : "text-ink-dim hover:bg-surface hover:text-ink",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {project.id === activeId ? <Check className="size-3.5 shrink-0 text-ok" aria-hidden /> : null}
                  </button>
                </li>
              ))}
              {projects.length === 0 ? <li className="px-2 py-2 text-[12.5px] text-faint">Belum ada project.</li> : null}
            </ul>
            <div className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNew();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink transition-colors duration-150 hover:bg-surface"
              >
                <Plus className="size-3.5 shrink-0" aria-hidden />
                Project baru
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        {activeProject ? (
          <>
            <Link href={`/projects/${activeProject.id}`} className={action} aria-label="Buka workspace project">
              <FolderOpen className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Workspace</span>
            </Link>
            <button type="button" onClick={onZip} className={action} aria-label="Download project">
              <Download className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Download</span>
            </button>
            <div className="relative" ref={confirmRef}>
              <button
                type="button"
                onClick={() => setConfirm((value) => !value)}
                disabled={!canClear || clearing}
                className={cn(action, "disabled:opacity-40")}
                aria-haspopup="dialog"
                aria-expanded={confirm}
                aria-label="Hapus riwayat percakapan"
                title="Hapus riwayat"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
              {confirm ? (
                <div
                  role="dialog"
                  aria-label="Hapus riwayat percakapan"
                  className="absolute right-0 top-[calc(100%+6px)] z-30 w-[min(268px,calc(100vw-1.5rem))] rounded-xl border border-line bg-panel/95 p-3 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.6)] backdrop-blur-xl"
                >
                  <p className="text-[12.5px] font-medium text-ink">Hapus riwayat chat?</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">Semua pesan di project ini dihapus. File dan project tetap ada.</p>
                  <div className="mt-3 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirm(false)}
                      className="h-7 rounded-md px-2 text-[12px] text-muted transition-colors hover:bg-surface hover:text-ink"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirm(false);
                        onClear();
                      }}
                      className="h-7 rounded-md bg-danger/15 px-2.5 text-[12px] font-medium text-danger transition-colors hover:bg-danger/25"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
