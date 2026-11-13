"use client";

import { useMemo } from "react";
import { diffLines } from "diff";
import { cn } from "@/lib/utils";

export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffLines(before, after), [before, after]);
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const part of parts) {
      const count = (part.value.match(/\n/g) || []).length;
      if (part.added) added += count || 1;
      else if (part.removed) removed += count || 1;
    }
    return { added, removed };
  }, [parts]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-3 py-1.5 text-[11.5px]">
        <span className="text-ok">+{stats.added}</span>
        <span className="text-danger">-{stats.removed}</span>
        <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">diff</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[11.5px] leading-[1.55]">
          <tbody>
            {parts.map((part, partIndex) =>
              part.value
                .replace(/\n$/, "")
                .split("\n")
                .map((line, lineIndex) => (
                  <tr
                    key={`${partIndex}-${lineIndex}`}
                    className={cn(part.added ? "bg-ok/10" : part.removed ? "bg-danger/10" : "")}
                  >
                    <td className="w-6 select-none border-r border-line/60 px-1.5 text-right text-faint">
                      {part.added ? "+" : part.removed ? "-" : " "}
                    </td>
                    <td className={cn("whitespace-pre-wrap break-words px-2", part.added ? "text-ok" : part.removed ? "text-danger" : "text-ink-dim")}>
                      {line || " "}
                    </td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
