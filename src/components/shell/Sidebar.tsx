"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, FolderCode, Image as ImageIcon, MessageSquare, Plus, Settings2 } from "lucide-react";
import { api } from "@/lib/client/api";
import type { ProjectMeta } from "@/lib/workspace/service";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/projects", label: "Projects", icon: FolderCode },
  { href: "/studio/image", label: "Image", icon: ImageIcon },
  { href: "/studio/audio", label: "Audio", icon: AudioLines },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);

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
        {NAV.map((item) => {
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
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    onClick={onNavigate}
                    className={cn(
                      "block truncate rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors",
                      active ? "bg-surface text-ink" : "text-muted hover:bg-surface/70 hover:text-ink",
                    )}
                  >
                    {project.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line p-2.5">
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
    </aside>
  );
}
