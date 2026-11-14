"use client";

import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/lib/agent/engine";

const LABELS: Record<AgentStatus, string> = {
  thinking: "Lagi mikir",
  planning: "Nyusun rencana",
  writing: "Nulis file",
  editing: "Ngedit kode",
  checking: "Ngecek project",
  building: "Building",
  completed: "Selesai",
  failed: "Gagal",
};

const ORDER: AgentStatus[] = ["thinking", "planning", "writing", "checking", "completed"];

export function StatusRail({ status, detail }: { status: AgentStatus | null; detail?: string }) {
  if (!status) return null;
  const failed = status === "failed";
  const index = ORDER.indexOf(status);

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-[11.5px]">
      <span className={cn("flex items-center gap-1.5 font-medium", failed ? "text-danger" : status === "completed" ? "text-ok" : "text-accent")}>
        {failed || status === "completed" ? (
          <span className={cn("size-1.5 rounded-full", failed ? "bg-danger" : "bg-ok")} aria-hidden />
        ) : (
          <span className={cn("aomi-pulse", failed ? "bg-danger" : "bg-accent")} aria-hidden />
        )}
        {LABELS[status]}
      </span>
      {detail ? <span className="truncate font-mono text-[11px] text-faint">{detail}</span> : null}
      <ol className="ml-auto hidden items-center gap-1 sm:flex" aria-hidden>
        {ORDER.map((step, stepIndex) => (
          <li key={step}>
            <span className={cn("block h-0.5 w-5 rounded-full", index >= stepIndex ? (failed ? "bg-danger/50" : "bg-accent/60") : "bg-line")} />
          </li>
        ))}
      </ol>
    </div>
  );
}
