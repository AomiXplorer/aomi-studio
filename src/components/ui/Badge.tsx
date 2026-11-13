import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";

const tones: Record<Tone, string> = {
  neutral: "border-line text-muted",
  accent: "border-accent/40 text-accent",
  ok: "border-ok/35 text-ok",
  warn: "border-warn/35 text-warn",
  danger: "border-danger/40 text-danger",
};

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse }: { tone?: Tone; pulse?: boolean }) {
  const color =
    tone === "ok" ? "bg-ok" : tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : tone === "accent" ? "bg-accent" : "bg-faint";
  return <span className={cn("inline-block size-1.5 rounded-full", color, pulse && "animate-pulse")} aria-hidden />;
}
