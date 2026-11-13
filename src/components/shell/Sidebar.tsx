"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines, FolderCode, Image as ImageIcon, MessageSquare, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare, hint: "Agent workspace" },
  { href: "/projects", label: "Projects", icon: FolderCode, hint: "Semua project" },
  { href: "/studio/image", label: "Image", icon: ImageIcon, hint: "Image studio" },
  { href: "/studio/audio", label: "Audio", icon: AudioLines, hint: "Voice studio" },
  { href: "/settings", label: "Settings", icon: Settings2, hint: "Model & provider" },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full min-h-dvh w-[212px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex h-14 items-center px-5">
        <Link href="/chat" onClick={onNavigate} className="flex items-baseline gap-1.5">
          <span className="font-mono text-[15px] lowercase tracking-tight text-ink">aomi</span>
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
        </Link>
      </div>

      <nav aria-label="Navigasi utama" className="mt-2 flex flex-col gap-0.5 px-2.5">
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
                "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors duration-150",
                active ? "bg-surface text-ink" : "text-muted hover:bg-surface/60 hover:text-ink-dim",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-faint group-hover:text-muted")} aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-5 pb-5">
        <p className="text-[11px] leading-relaxed text-faint">
          Aomi menulis file sungguhan di workspace. Setiap perubahan bisa dilihat dan diunduh.
        </p>
      </div>
    </aside>
  );
}
