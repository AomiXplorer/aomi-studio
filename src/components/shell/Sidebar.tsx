"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle, AudioLines, FolderCode, Image as ImageIcon, MessageSquare, Plus, Settings2, ShieldCheck, Trash2, X } from "lucide-react";
import { api } from "@/lib/client/api";
import type { ProjectMeta } from "@/lib/workspace/service";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { AccountMenu } from "@/components/auth/AccountMenu";

const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/projects", label: "Projects", icon: FolderCode },
  { href: "/studio/image", label: "Image", icon: ImageIcon },
  { href: "/studio/audio", label: "Audio", icon: AudioLines },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [target, setTarget] = useState<ProjectMeta | null>(null);
  const [busy, setBusy] = useState<"chat" | "project" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (alive && payload?.user?.role === "admin") setIsAdmin(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { projects: list } = await api.projects.list();
      setProjects(list.slice(0, 8));
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  // A project created or deleted anywhere in the app shows up here immediately.
  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener("aomi:project-created", onChange);
    window.addEventListener("aomi:project-deleted", onChange);
    return () => {
      window.removeEventListener("aomi:project-created", onChange);
      window.removeEventListener("aomi:project-deleted", onChange);
    };
  }, [refresh]);

  useEffect(() => {
    if (!target) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, busy]);

  const forgetIfActive = (id: string) => {
    if (window.localStorage.getItem("aomi:project") === id) window.localStorage.removeItem("aomi:project");
  };

  const clearChat = async () => {
    if (!target) return;
    setBusy("chat");
    setError(null);
    try {
      await api.messages.remove(target.id);
      window.dispatchEvent(new CustomEvent("aomi:history-cleared", { detail: { projectId: target.id } }));
      setTarget(null);
    } catch (clearError) {
      setError((clearError as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeProject = async () => {
    if (!target) return;
    const id = target.id;
    setBusy("project");
    setError(null);
    try {
      await api.projects.remove(id);
      forgetIfActive(id);
      window.dispatchEvent(new CustomEvent("aomi:project-deleted", { detail: { projectId: id } }));
      setTarget(null);
      await refresh();
      if (pathname.startsWith(`/projects/${id}`)) router.push("/chat");
      else router.refresh();
    } catch (removeError) {
      setError((removeError as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className="flex h-full min-h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="px-4 pt-4">
        <Link href="/chat" onClick={onNavigate} className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-[9px] bg-accent text-[13px] font-semibold text-accent-ink">a</span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">aomi</span>
        </Link>

        <Link
          href="/chat?new=1"
          onClick={onNavigate}
          className="mt-4 flex h-9 items-center justify-center gap-1.5 rounded-xl bg-accent text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent/90"
        >
          <Plus className="size-4" aria-hidden /> Chat baru
        </Link>
      </div>

      <nav aria-label="Navigasi utama" className="mt-4 flex flex-col gap-0.5 px-2.5">
        {(isAdmin ? [...NAV, { href: "/admin", label: "Admin", icon: ShieldCheck }] : NAV).map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors duration-150",
                active ? "bg-surface font-medium text-ink" : "text-muted hover:bg-surface/70 hover:text-ink",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-ink" : "text-faint")} aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-2.5">
        <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Terbaru</p>
        {projects.length === 0 ? (
          <p className="px-2.5 py-1 text-[12px] leading-relaxed text-faint">Belum ada project.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {projects.map((project) => {
              const active = pathname === `/projects/${project.id}`;
              return (
                <li key={project.id} className="group/item flex items-center gap-0.5">
                  <Link
                    href={`/projects/${project.id}`}
                    onClick={onNavigate}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors",
                      active ? "bg-surface text-ink" : "text-muted group-hover/item:bg-surface/70 group-hover/item:text-ink",
                    )}
                  >
                    {project.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setTarget(project);
                    }}
                    aria-label={`Hapus project ${project.name}`}
                    title="Hapus"
                    className="grid size-6 shrink-0 place-items-center rounded-md text-faint opacity-60 transition-colors duration-150 hover:bg-surface hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:opacity-0 sm:group-hover/item:opacity-100"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line p-2.5">
        <AccountMenu onNavigate={onNavigate} className="mb-1" />
        <ThemeToggle className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:bg-surface hover:text-ink" />
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-current={pathname === "/settings" ? "page" : undefined}
          className={cn(
            "mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
            pathname === "/settings" ? "bg-surface font-medium text-ink" : "text-muted hover:bg-surface/70 hover:text-ink",
          )}
        >
          <Settings2 className="size-4 shrink-0 text-faint" aria-hidden />
          <span className="truncate">Settings</span>
        </Link>
      </div>

      {target ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
          <button
            type="button"
            aria-label="Tutup"
            onClick={() => (busy ? undefined : setTarget(null))}
            className="absolute inset-0 bg-black/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Hapus ${target.name}`}
            className="relative w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[14px] font-medium text-ink">Hapus “{target.name}”</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">Pilih apa yang dihapus. Tidak bisa dibatalkan.</p>
              </div>
              <button
                type="button"
                onClick={() => setTarget(null)}
                aria-label="Tutup"
                className="grid size-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-surface hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => void clearChat()}
                disabled={boxedBusy(busy)}
                className="rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface disabled:opacity-50"
              >
                <span className="block text-[12.5px] font-medium text-ink">
                  {busy === "chat" ? "Menghapus riwayat..." : "Hapus riwayat chat saja"}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-muted">Pesan hilang, file dan project tetap ada.</span>
              </button>
              <button
                type="button"
                onClick={() => void removeProject()}
                disabled={boxedBusy(busy)}
                className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-left transition-colors hover:bg-danger/15 disabled:opacity-50"
              >
                <span className="block text-[12.5px] font-medium text-danger">
                  {busy === "project" ? "Menghapus project..." : "Hapus project"}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-muted">Project, file, dan riwayat chat ikut hilang.</span>
              </button>
            </div>

            {error ? (
              <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-danger">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => setTarget(null)}
              disabled={boxedBusy(busy)}
              className="mt-2 h-8 w-full rounded-lg text-[12.5px] text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
            >
              Batal
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

const boxedBusy = (busy: "chat" | "project" | null) => busy !== null;
