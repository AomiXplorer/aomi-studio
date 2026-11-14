"use client";

import { Building2, Gamepad2, Globe, Sparkles, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The first thing anyone sees in an empty project. One idea per card, a short label and
 * the prompt it will send, rather than four paragraphs of text.
 */
const SUGGESTIONS: { icon: LucideIcon; title: string; hint: string; prompt: string }[] = [
  {
    icon: Globe,
    title: "Portfolio",
    hint: "Halaman project dan kontak",
    prompt: "Buatkan website portfolio programmer dengan halaman project dan kontak.",
  },
  {
    icon: Building2,
    title: "Company profile",
    hint: "Studio desain, gaya editorial",
    prompt: "Buatkan company profile statis untuk studio desain, gaya editorial.",
  },
  {
    icon: Gamepad2,
    title: "Visual novel",
    hint: "Game sederhana bertema sekolah",
    prompt: "Buatkan game visual novel sederhana bertema kehidupan sekolah.",
  },
  {
    icon: Terminal,
    title: "CLI tool",
    hint: "Baca CSV, cetak ringkasan",
    prompt: "Buatkan CLI TypeScript yang membaca CSV dan mencetak ringkasannya.",
  },
];

export function EmptyState({ onPick, projectName }: { onPick: (prompt: string) => void; projectName?: string }) {
  return (
    <div className="aomi-rise flex min-h-[min(58vh,520px)] flex-col items-center justify-center py-8 text-center sm:py-12">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
        <Sparkles className="size-3.5" aria-hidden />
        {projectName ? `workspace siap · ${projectName}` : "workspace siap"}
      </p>

      <h1 className="mt-5 max-w-[20ch] text-balance text-[clamp(1.75rem,5.4vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.035em] text-ink">
        Mau dibangun apa hari ini?
      </h1>

      <p className="mt-3 max-w-[44ch] text-[13.5px] leading-relaxed text-muted">
        Tulis satu kalimat. Aomi menyusun rencana, menulis file sungguhan, lalu kamu buka di workspace atau unduh sebagai ZIP.
      </p>

      <ul className="mt-9 grid w-full gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map(({ icon: Icon, title, hint, prompt }) => (
          <li key={title}>
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className="group flex w-full items-start gap-3 rounded-xl border border-line bg-raised/60 p-3 text-left transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong hover:bg-surface active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <span className="mt-px grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-bg text-muted transition-colors duration-150 group-hover:border-line-strong group-hover:text-ink">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium tracking-[-0.01em] text-ink">{title}</span>
                <span className="mt-0.5 block text-[12px] leading-[1.5] text-muted">{hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
