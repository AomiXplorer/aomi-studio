"use client";

import { useMemo, useState } from "react";
import { ChevronRight, File, FileCode2, FileJson, FileText, Image as ImageIcon, Search } from "lucide-react";
import type { FileEntry } from "@/lib/workspace/service";
import { cn, formatBytes } from "@/lib/utils";
import { Input } from "@/components/ui/Field";

interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
  entry?: FileEntry;
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const file of files) {
    const segments = file.path.split("/");
    let node = root;
    segments.forEach((segment, index) => {
      const isLeaf = index === segments.length - 1;
      const path = segments.slice(0, index + 1).join("/");
      node.children = node.children || [];
      let next = node.children.find((child) => child.name === segment);
      if (!next) {
        next = isLeaf ? { name: segment, path, entry: file } : { name: segment, path, children: [] };
        node.children.push(next);
      }
      node = next;
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => {
        const aDir = Boolean(a.children);
        const bDir = Boolean(b.children);
        if (aDir !== bDir) return aDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => (node.children ? { ...node, children: sort(node.children) } : node));
  return sort(root.children || []);
}

function iconFor(path: string) {
  if (/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(path)) return ImageIcon;
  if (/\.json$/i.test(path)) return FileJson;
  if (/\.(tsx?|jsx?|mjs|cjs|css|scss|html|py|sh)$/i.test(path)) return FileCode2;
  if (/\.(md|txt)$/i.test(path)) return FileText;
  return File;
}

export function FileTree({
  files,
  activePath,
  onSelect,
  onDelete,
}: {
  files: FileEntry[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const filtered = useMemo(
    () => (query ? files.filter((file) => file.path.toLowerCase().includes(query.toLowerCase())) : files),
    [files, query],
  );
  const tree = useMemo(() => buildTree(filtered), [filtered]);

  const renderNodes = (nodes: TreeNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => {
      if (node.children) {
        const isCollapsed = collapsed[node.path] ?? false;
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => setCollapsed((current) => ({ ...current, [node.path]: !isCollapsed }))}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[12.5px] text-muted transition-colors hover:bg-surface hover:text-ink"
              style={{ paddingLeft: 6 + depth * 12 }}
            >
              <ChevronRight className={cn("size-3 shrink-0 text-faint transition-transform", !isCollapsed && "rotate-90")} aria-hidden />
              <span className="truncate">{node.name}</span>
            </button>
            {!isCollapsed ? <ul>{renderNodes(node.children, depth + 1)}</ul> : null}
          </li>
        );
      }
      const Icon = iconFor(node.path);
      const active = activePath === node.path;
      return (
        <li key={node.path}>
          <div
            className={cn(
              "group flex items-center gap-1.5 rounded px-1.5 py-1 text-[12.5px] transition-colors",
              active ? "bg-surface text-ink" : "text-ink-dim hover:bg-surface/60",
            )}
            style={{ paddingLeft: 6 + depth * 12 }}
          >
            <button type="button" onClick={() => onSelect(node.path)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title={node.path}>
              <Icon className={cn("size-3.5 shrink-0", active ? "text-accent" : "text-faint")} aria-hidden />
              <span className="truncate">{node.name}</span>
            </button>
            {onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(node.path)}
                className="hidden shrink-0 rounded px-1 text-[10px] uppercase tracking-wide text-faint hover:text-danger group-hover:block"
                aria-label={`Hapus ${node.path}`}
              >
                hapus
              </button>
            ) : null}
          </div>
        </li>
      );
    });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari file"
            aria-label="Cari file"
            className="h-7 pl-7 text-[12px]"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-faint">Belum ada file.</p>
        ) : (
          <ul className="space-y-0.5">{renderNodes(tree)}</ul>
        )}
      </div>
      <div className="border-t border-line px-2.5 py-1.5 text-[11px] text-faint">
        {files.length} file · {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}
      </div>
    </div>
  );
}
