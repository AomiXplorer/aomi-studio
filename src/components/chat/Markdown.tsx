"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const language = /language-([\w+-]+)/.exec(className || "")?.[1] || "code";

  const copy = async () => {
    const text = extractText(children);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line bg-surface/60 px-3 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">{language}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-ink"
          aria-label="Salin kode"
        >
          {copied ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />}
          {copied ? "Tersalin" : "Salin"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 text-[12.5px] leading-[1.65]">
        <code className={cn("font-mono", className)}>{children}</code>
      </pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in (node as { props?: { children?: React.ReactNode } })) {
    return extractText((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return "";
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="text-[13.5px] leading-[1.7] text-ink-dim">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          h1: ({ children }) => <h1 className="mb-2 mt-4 text-[17px] font-semibold text-ink first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-[15px] font-semibold text-ink first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-[13.5px] font-semibold text-ink first:mt-0">{children}</h3>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-faint">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-faint">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-line-strong pl-3 text-muted">{children}</blockquote>,
          hr: () => <hr className="my-4 border-line" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-[12.5px]">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-line bg-surface px-2.5 py-1.5 text-left font-medium text-ink">{children}</th>,
          td: ({ children }) => <td className="border-b border-line/60 px-2.5 py-1.5 align-top">{children}</td>,
          code: ({ className, children }) => {
            const isBlock = Boolean(className?.includes("language-")) || String(children).includes("\n");
            if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
            return <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-accent">{children}</code>;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
