import { listProjectFiles, readProjectText, type FileEntry } from "@/lib/workspace/service";

export interface ProjectCheck {
  level: "error" | "warning" | "info";
  message: string;
  file?: string;
}

export interface ProjectAnalysis {
  files: number;
  textFiles: number;
  totalBytes: number;
  stack: string;
  dependencies: string[];
  scripts: string[];
  entrypoints: string[];
  todos: { file: string; line: number; text: string }[];
  checks: ProjectCheck[];
  tree: string;
}

const BUILD_FILES = new Set(["package.json", "next.config.ts", "next.config.mjs", "vite.config.ts", "index.html", "tsconfig.json"]);

function dependencyStack(deps: Record<string, string>): string {
  if (deps.next) return "nextjs";
  if (deps.vite && deps.react) return "react-vite";
  if (deps.react) return "react";
  if (deps.express || deps.fastify) return "node-api";
  if (Object.keys(deps).length) return "node";
  return "static";
}

export function buildTree(entries: FileEntry[]): string {
  const root: Record<string, unknown> = {};
  for (const entry of entries) {
    const segments = entry.path.split("/");
    let node = root;
    segments.forEach((segment, index) => {
      if (index === segments.length - 1) {
        node[segment] = null;
      } else {
        node[segment] = (node[segment] as Record<string, unknown>) || {};
        node = node[segment] as Record<string, unknown>;
      }
    });
  }
  const render = (node: Record<string, unknown>, depth: number): string[] =>
    Object.keys(node)
      .sort((a, b) => {
        const aDir = node[a] !== null;
        const bDir = node[b] !== null;
        if (aDir !== bDir) return aDir ? -1 : 1;
        return a.localeCompare(b);
      })
      .flatMap((key) => [
        `${"  ".repeat(depth)}${key}${node[key] !== null ? "/" : ""}`,
        ...(node[key] !== null ? render(node[key] as Record<string, unknown>, depth + 1) : []),
      ]);
  return render(root, 0).join("\n");
}

export async function analyzeProject(projectId: string): Promise<ProjectAnalysis> {
  const entries = await listProjectFiles(projectId);
  const checks: ProjectCheck[] = [];
  const todos: { file: string; line: number; text: string }[] = [];
  const textFiles: Record<string, string> = {};

  for (const entry of entries) {
    if (!entry.isText || entry.size > 300_000) continue;
    const content = await readProjectText(projectId, entry.path);
    if (content === null) continue;
    textFiles[entry.path] = content;
    content.split("\n").forEach((line, index) => {
      if (/TODO|FIXME/.test(line)) todos.push({ file: entry.path, line: index + 1, text: line.trim().slice(0, 160) });
    });
    if (entry.size === 0) checks.push({ level: "warning", message: "File kosong.", file: entry.path });
    // Bracket balance catches the most common hand-written syntax break early.
    if (/\.(tsx?|jsx?|mjs|cjs|css|scss|less|html?|vue|svelte)$/i.test(entry.path)) {
      const balance = bracketBalance(content);
      if (!balance.balanced) {
        checks.push({ level: "error", message: balance.message || "Kurung tidak seimbang.", file: entry.path });
      }
    }
  }

  let dependencies: string[] = [];
  let scripts: string[] = [];
  let stack = "static";

  const pkgPath = entries.find((entry) => entry.path === "package.json")?.path;
  if (pkgPath && textFiles[pkgPath]) {
    try {
      const pkg = JSON.parse(textFiles[pkgPath]) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      const merged = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      dependencies = Object.keys(merged).sort();
      scripts = Object.keys(pkg.scripts || {});
      stack = dependencyStack(merged);
      if (!entries.some((entry) => /^readme\.md$/i.test(entry.path))) {
        checks.push({ level: "info", message: "package.json ada tapi README.md belum dibuat." });
      }
      if (!(pkg.scripts || {}).build && stack !== "static") {
        checks.push({ level: "warning", message: "package.json tidak punya script build.", file: "package.json" });
      }
    } catch (error) {
      checks.push({ level: "error", message: `package.json bukan JSON valid: ${(error as Error).message}`, file: "package.json" });
    }
  } else if (entries.length > 0) {
    checks.push({ level: "info", message: "Tidak ada package.json; project dianggap aset statis." });
  }

  // Resolve relative imports against the file list to catch broken references.
  for (const [path, content] of Object.entries(textFiles)) {
    if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(path)) continue;
    const dir = path.includes("/") ? path.split("/").slice(0, -1).join("/") : "";
    const matches = content.matchAll(/from\s+["'](\.[^"']+)["']/g);
    for (const match of matches) {
      const spec = match[1];
      const base = resolveRelative(dir, spec);
      const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`];
      if (!candidates.some((candidate) => textFiles[candidate] !== undefined || entries.some((entry) => entry.path === candidate))) {
        checks.push({ level: "error", message: `Import "${spec}" tidak menunjuk ke file mana pun.`, file: path });
      }
    }
  }

  const entrypoints = entries
    .map((entry) => entry.path)
    .filter((path) => BUILD_FILES.has(path) || /^(src\/)?(main|index|app|page)\.(tsx?|jsx?|html)$/.test(path));

  if (!entries.length) checks.push({ level: "info", message: "Workspace masih kosong." });

  return {
    files: entries.length,
    textFiles: Object.keys(textFiles).length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    stack,
    dependencies,
    scripts,
    entrypoints,
    todos,
    checks,
    tree: entries.length ? buildTree(entries) : "(kosong)",
  };
}

function resolveRelative(dir: string, spec: string): string {
  const baseSegments = dir ? dir.split("/") : [];
  const specSegments = spec.split("/");
  for (const segment of specSegments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") baseSegments.pop();
    else baseSegments.push(segment);
  }
  return baseSegments.join("/");
}

/** Cheap syntax sanity check: balanced braces/parens outside strings and comments. */
export function bracketBalance(source: string): { balanced: boolean; message?: string } {
  const stack: string[] = [];
  const pairs: Record<string, string> = { "}": "{", ")": "(", "]": "[" };
  let inString: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === "/" && next === "/") { inLineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { inBlockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { inString = char; continue; }
    if ("{([".includes(char)) stack.push(char);
    else if ("})]".includes(char)) {
      const expected = pairs[char];
      if (stack.pop() !== expected) return { balanced: false, message: `Kurung "${char}" tidak cocok.` };
    }
  }
  if (stack.length) return { balanced: false, message: `Kurung "${stack[stack.length - 1]}" belum ditutup.` };
  return { balanced: true };
}
