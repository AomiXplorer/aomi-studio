import { z } from "zod";
import {
  deleteProjectFile,
  listProjectFiles,
  readProjectText,
  renameProjectFile,
  searchProjectFiles,
  writeProjectFile,
} from "@/lib/workspace/service";
import { sanitizeRelPath, WorkspacePathError } from "@/lib/workspace/paths";
import { defineTool, type AgentTool, type ToolResult } from "./types";

const TEXT_LIMIT = 60_000;

function fail(error: unknown): ToolResult {
  const message = error instanceof WorkspacePathError ? error.message : (error as Error).message;
  return { ok: false, summary: `Gagal: ${message}`, error: message };
}

const createFile = defineTool({
  name: "create_file",
  description:
    "Create a new file inside the current project workspace. Fails if the file already exists; use write_file to overwrite. Returns the final path.",
  category: "filesystem",
  schema: z.object({
    path: z.string().describe("Workspace-relative path, e.g. src/app/page.tsx"),
    content: z.string().optional().describe("Full file content. Omit for an empty file."),
  }),
  async execute({ path, content }, ctx) {
    try {
      const clean = sanitizeRelPath(path);
      const existing = await readProjectText(ctx.projectId, clean);
      if (existing !== null) {
        return { ok: false, summary: `${clean} sudah ada`, error: `File ${clean} sudah ada. Baca dulu, lalu pakai edit_file atau write_file.` };
      }
      const result = await writeProjectFile(ctx.projectId, clean, content ?? "");
      return {
        ok: true,
        summary: `Membuat ${clean} (${result.size} byte)`,
        data: { path: result.path, size: result.size },
        filesChanged: [{ path: result.path, before: null, after: content ?? "" }],
      };
    } catch (error) {
      return fail(error);
    }
  },
});

const readFile = defineTool({
  name: "read_file",
  description:
    "Read a file from the workspace. Always read before editing so unrelated code is preserved. Supports an optional 1-based line range for large files.",
  category: "filesystem",
  schema: z.object({
    path: z.string().describe("Workspace-relative path"),
    start_line: z.number().int().min(1).optional().describe("1-based first line to return"),
    end_line: z.number().int().min(1).optional().describe("1-based last line to return"),
  }),
  async execute({ path, start_line, end_line }, ctx) {
    try {
      const clean = sanitizeRelPath(path);
      const content = await readProjectText(ctx.projectId, clean);
      if (content === null) return { ok: false, summary: `${clean} tidak ditemukan`, error: `File ${clean} tidak ada di workspace.` };
      const lines = content.split("\n");
      const from = start_line ? start_line - 1 : 0;
      const to = end_line ? end_line : lines.length;
      const slice = lines.slice(from, to);
      let text = slice.join("\n");
      if (text.length > TEXT_LIMIT) text = `${text.slice(0, TEXT_LIMIT)}\n... (dipotong, total ${content.length} karakter)`;
      return {
        ok: true,
        summary: `Membaca ${clean} (${lines.length} baris)`,
        data: { path: clean, lines: lines.length, from: from + 1, to: Math.min(to, lines.length), content: text },
      };
    } catch (error) {
      return fail(error);
    }
  },
});

const writeFile = defineTool({
  name: "write_file",
  description: "Overwrite a file with full new content. Creates parent folders. Use only when the whole file must change.",
  category: "filesystem",
  schema: z.object({
    path: z.string().describe("Workspace-relative path"),
    content: z.string().describe("Complete new file content"),
  }),
  async execute({ path, content }, ctx) {
    try {
      const clean = sanitizeRelPath(path);
      const before = await readProjectText(ctx.projectId, clean);
      const result = await writeProjectFile(ctx.projectId, clean, content);
      return {
        ok: true,
        summary: `${result.created ? "Menulis" : "Memperbarui"} ${clean} (${result.size} byte)`,
        data: { path: result.path, size: result.size, created: result.created },
        filesChanged: [{ path: result.path, before, after: content }],
      };
    } catch (error) {
      return fail(error);
    }
  },
});

const editFile = defineTool({
  name: "edit_file",
  description:
    "Replace an exact snippet inside a file. Prefer this over write_file for small changes: it keeps the rest of the file untouched. The find string must match the file exactly, including indentation.",
  category: "filesystem",
  schema: z.object({
    path: z.string().describe("Workspace-relative path"),
    find: z.string().describe("Exact snippet to replace, copied from the file"),
    replace: z.string().describe("Replacement snippet"),
    all: z.boolean().optional().describe("Replace every occurrence instead of the first"),
  }),
  async execute({ path, find, replace, all }, ctx) {
    try {
      const clean = sanitizeRelPath(path);
      const before = await readProjectText(ctx.projectId, clean);
      if (before === null) return { ok: false, summary: `${clean} tidak ditemukan`, error: `File ${clean} tidak ada.` };
      if (!find) return { ok: false, summary: "Snippet pencarian kosong", error: "Parameter find tidak boleh kosong." };
      const occurrences = before.split(find).length - 1;
      if (occurrences === 0) {
        return { ok: false, summary: `Snippet tidak cocok di ${clean}`, error: "find tidak ditemukan. Baca file lagi dan salin snippet persis." };
      }
      const after = all ? before.split(find).join(replace) : before.replace(find, replace);
      const replaced = all ? occurrences : 1;
      await writeProjectFile(ctx.projectId, clean, after);
      return {
        ok: true,
        summary: `Mengedit ${clean} (${replaced} bagian)`,
        data: { path: clean, replaced },
        filesChanged: [{ path: clean, before, after }],
      };
    } catch (error) {
      return fail(error);
    }
  },
});

const deleteFile = defineTool({
  name: "delete_file",
  description: "Delete a file from the workspace.",
  category: "filesystem",
  schema: z.object({ path: z.string().describe("Workspace-relative path") }),
  async execute({ path }, ctx) {
    try {
      const clean = sanitizeRelPath(path);
      const before = await readProjectText(ctx.projectId, clean);
      if (before === null) return { ok: false, summary: `${clean} tidak ditemukan`, error: `File ${clean} tidak ada.` };
      await deleteProjectFile(ctx.projectId, clean);
      return {
        ok: true,
        summary: `Menghapus ${clean}`,
        data: { path: clean },
        filesChanged: [{ path: clean, before, after: null }],
      };
    } catch (error) {
      return fail(error);
    }
  },
});

const renameFile = defineTool({
  name: "rename_file",
  description: "Rename or move a file inside the workspace.",
  category: "filesystem",
  schema: z.object({
    from: z.string().describe("Current workspace-relative path"),
    to: z.string().describe("New workspace-relative path"),
  }),
  async execute({ from, to }, ctx) {
    try {
      const before = await readProjectText(ctx.projectId, from);
      const moved = await renameProjectFile(ctx.projectId, from, to);
      return {
        ok: true,
        summary: `Memindahkan ${moved.from} → ${moved.to}`,
        data: moved,
        filesChanged: [
          { path: moved.from, before, after: null },
          { path: moved.to, before: null, after: before },
        ],
      };
    } catch (error) {
      return fail(error);
    }
  },
});

const listFiles = defineTool({
  name: "list_files",
  description: "List project files, optionally filtered by a folder prefix. Use it to see the structure before editing.",
  category: "filesystem",
  schema: z.object({ dir: z.string().optional().describe("Folder prefix, e.g. src/components") }),
  async execute({ dir }, ctx) {
    try {
      const entries = await listProjectFiles(ctx.projectId);
      const filtered = dir ? entries.filter((entry) => entry.path.startsWith(dir.replace(/^\/+/, ""))) : entries;
      return {
        ok: true,
        summary: `${filtered.length} file${dir ? ` di ${dir}` : ""}`,
        data: { count: filtered.length, files: filtered.map((entry) => ({ path: entry.path, bytes: entry.size })) },
      };
    } catch (error) {
      return fail(error);
    }
  },
});

const searchInFiles = defineTool({
  name: "search_in_files",
  description: "Search text across the project's text files. Returns matching lines with file and line number.",
  category: "filesystem",
  schema: z.object({
    query: z.string().describe("Text to search"),
    case_sensitive: z.boolean().optional(),
  }),
  async execute({ query, case_sensitive }, ctx) {
    try {
      if (!query.trim()) return { ok: false, summary: "Query kosong", error: "query wajib diisi." };
      const results = await searchProjectFiles(ctx.projectId, query, { caseSensitive: case_sensitive });
      return {
        ok: true,
        summary: `${results.length} kecocokan untuk "${query.slice(0, 40)}"`,
        data: { count: results.length, results },
      };
    } catch (error) {
      return fail(error);
    }
  },
});

export const filesystemTools: AgentTool[] = [
  createFile,
  readFile,
  writeFile,
  editFile,
  deleteFile,
  renameFile,
  listFiles,
  searchInFiles,
];
