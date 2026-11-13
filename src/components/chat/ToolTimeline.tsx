"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolEntry {
  id: string;
  name: string;
  status: "running" | "ok" | "error";
  summary: string;
  args?: Record<string, unknown>;
}

/**
 * Collapsed by default: the interesting part of an answer is the result, so the
 * step trail stays one quiet line until someone opens it.
 */
export function ToolTimeline({ tools }: { tools: ToolEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!tools.length) return null;

  const running = tools.some((tool) => tool.status === "running");
  const failed = tools.some((tool) => tool.status === "error");
  const label = running
    ? `Bekerja · ${tools.length} langkah`
    : failed
      ? `${tools.length} langkah · ada yang gagal`
      : `${tools.length} langkah selesai`;

  return (
    <div className="my-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        {running ? (
          <Loader2 className="size-3 animate-spin text-accent" aria-hidden />
        ) : failed ? (
          <AlertTriangle className="size-3 text-danger" aria-hidden />
        ) : (
          <Check className="size-3 text-ok" aria-hidden />
        )}
        <span>{label}</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <ul className="mt-2 space-y-1 border-l border-line pl-3">
          {tools.map((tool) => {
            const Icon = tool.status === "running" ? Loader2 : tool.status === "ok" ? Check : AlertTriangle;
            return (
              <li key={tool.id} className="flex items-start gap-2 py-0.5">
                <Icon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    tool.status === "running" && "animate-spin text-accent",
                    tool.status === "ok" && "text-ok",
                    tool.status === "error" && "text-danger",
                  )}
                  aria-hidden
                />
                <span className="font-mono text-[11.5px] text-ink-dim">{tool.name}</span>
                <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted">{tool.summary}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
