"use client";

import { Building2, Gamepad2, Globe, Sparkles, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The first thing anyone sees in an empty project: one idea per card, a short label and
 * the prompt it sends. The room has one soft light overhead and everything arrives in a
 * short stagger, so the page feels alive without anything moving after it settles.
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
    <div className="relative flex flex-col items-center justify-center px-1 py-10 text-center sm:py-14">
      <div className="aomi-ambient" aria-hidden />

      <div className="relative z-10 flex w-full flex-col items-center">
        <p
          className="aomi-enter flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-faint"
          style={{ ["--i" as string]: 0 }}
        >
          <Sparkles className="size-3.5" aria-hidden />
          Siap, kita mulai!
          {projectName ? <span className="normal-case tracking-normal text-faint/80">· {projectName}</span> : null}
        </p>

        <h1
          className="aomi-enter mt-4 max-w-[22ch] text-balance text-[clamp(1.65rem,5vw,2.35rem)] font-semibold leading-[1.14] tracking-[-0.035em] text-ink"
          style={{ ["--i" as string]: 1 }}
        >
          Lagi mau bikin apa hari ini?
        </h1>

        <p
          className="aomi-enter mt-3 max-w-[40ch] text-[13.5px] leading-relaxed text-muted"
          style={{ ["--i" as string]: 2 }}
        >
          Punya ide? Ceritain aja. Biar Aomi bantu wujudkan jadi sesuatu yang keren.
        </p>

        <ul className="mt-7 grid w-full max-w-[560px] gap-2 sm:grid-cols-2 sm:gap-2.5">
          {SUGGESTIONS.map(({ icon: Icon, title, hint, prompt }, index) => (
            <li key={title} className="aomi-enter" style={{ ["--i" as string]: 3 + index }}>
              <button
                type="button"
                onClick={() => onPick(prompt)}
                className="aomi-card group flex w-full items-center gap-3 rounded-[14px] border border-line bg-raised/55 px-3 py-2.5 text-left hover:border-line-strong hover:bg-surface/70 active:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <span className="aomi-card-icon grid size-7 shrink-0 place-items-center rounded-[9px] border border-line bg-bg text-muted">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium tracking-[-0.01em] text-ink">{title}</span>
                  <span className="mt-0.5 block truncate text-[11.5px] leading-[1.45] text-muted">{hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
