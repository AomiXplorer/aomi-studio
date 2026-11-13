/** Workspace path guards. Every agent file operation goes through here. */

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per text file
export const MAX_TOTAL_FILES = 800;
export const RESERVED_ROOT_SEGMENTS = new Set(["node_modules", ".git", ".next", ".turbo", "dist", "build", "out", ".vercel"]);
export const RESERVED_INTERNAL_SEGMENTS = new Set([".aomi"]);

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspacePathError";
  }
}

/**
 * Normalises a workspace-relative path and rejects anything that could escape
 * the project root: absolute paths, `..` segments, drive letters, NUL bytes,
 * backslash separators and reserved directories.
 */
export function sanitizeRelPath(input: string, options: { allowReserved?: boolean } = {}): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new WorkspacePathError("Path file wajib diisi.");
  }
  let value = input.trim().replace(/\\/g, "/");
  if (value.includes("\0")) throw new WorkspacePathError("Path mengandung karakter tidak valid.");
  if (/^[a-zA-Z]:\//.test(value)) throw new WorkspacePathError("Path absolut tidak diizinkan.");
  if (value.startsWith("/")) value = value.replace(/^\/+/, "");
  const segments: string[] = [];
  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") throw new WorkspacePathError("Path traversal tidak diizinkan.");
    if (segment.length > 120) throw new WorkspacePathError("Nama file terlalu panjang.");
    segments.push(segment);
  }
  if (!segments.length) throw new WorkspacePathError("Path tidak valid.");
  const reserved = options.allowReserved ? RESERVED_INTERNAL_SEGMENTS : new Set([...RESERVED_ROOT_SEGMENTS, ...RESERVED_INTERNAL_SEGMENTS]);
  if (reserved.has(segments[0]) && segments.length === 1) {
    throw new WorkspacePathError(`Folder "${segments[0]}" tidak bisa dipakai sebagai file.`);
  }
  if (!options.allowReserved && reserved.has(segments[0])) {
    throw new WorkspacePathError(`Folder "${segments[0]}" dikelola sistem dan tidak bisa ditulis agent.`);
  }
  return segments.join("/");
}

const TEXT_EXTENSIONS = new Set([
  "ts","tsx","js","jsx","mjs","cjs","json","md","mdx","css","scss","sass","less","html","htm","txt","yml","yaml",
  "toml","env","gitignore","svg","xml","csv","sh","py","rb","go","rs","java","kt","php","sql","graphql","prisma","ini","lock",
]);

export function isTextPath(path: string): boolean {
  const name = path.split("/").pop() || "";
  if (name.startsWith(".") && name.includes(".")) {
    const ext = name.split(".").pop() || "";
    if (TEXT_EXTENSIONS.has(ext)) return true;
  }
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (!ext) return true;
  return TEXT_EXTENSIONS.has(ext);
}

export function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
    json: "json", md: "markdown", css: "css", scss: "scss", html: "html", yml: "yaml", yaml: "yaml",
    svg: "xml", xml: "xml", sh: "bash", py: "python", sql: "sql", txt: "text",
  };
  return map[ext] || "text";
}
