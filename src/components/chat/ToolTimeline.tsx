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

export function ToolTimeline({ tools }: { tools: ToolEntry[] }) {
  if (!tools.length) return null;
  return (
    <div className="my-2.5 space-y-1">
      {tools.map((tool) => (
        <ToolRow key={tool.id} tool={tool} />
      ))}
    </div>
  );
}

function ToolRow({ tool }: { tool: ToolEntry }) {
  const [open, setOpen] = useState(false);
  const Icon = tool.status === "running" ? Loader2 : tool.status === "ok" ? Check : AlertTriangle;

  return (
    <div className="rounded-md border border-line/80 bg-panel/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            tool.status === "running" && "animate-spin text-muted",
            tool.status === "ok" && "text-ok",
            tool.status === "error" && "text-danger",
          )}
          aria-hidden
        />
        <span className="font-mono text-[11.5px] text-ink-dim">{tool.name}</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{tool.summary}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-faint transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="border-t border-line/70 px-2.5 py-2">
          <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">arguments</p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted">
            {JSON.stringify(tool.args ?? {}, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
