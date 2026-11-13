import { z } from "zod";
import { listProjectFiles, readProjectText, writeProjectFile } from "@/lib/workspace/service";
import { sanitizeRelPath } from "@/lib/workspace/paths";
import { bracketBalance } from "@/lib/services/analysis";
import { defineTool, type AgentTool, type ToolContext, type ToolResult } from "./types";

const CODE_SYSTEM = [
  "You are Aomi's code analysis engine running inside the Aomi coding agent.",
  "Be precise and concrete. Reference real symbol names and line numbers.",
  "Never invent code that does not exist in the provided files.",
  "Answer in the same language the user writes in.",
].join(" ");

async function loadFile(ctx: ToolContext, rawPath: string) {
  const path = sanitizeRelPath(rawPath);
  const content = await readProjectText(ctx.projectId, path);
  return { path, content };
}

function extractFencedBlock(text: string): string | null {
  const match = text.match(/```[a-zA-Z0-9.+-]*\n([\s\S]*?)```/);
  if (match) return match[1].replace(/\n$/, "");
  return null;
}

const analyzeCode = defineTool({
  name: "analyze_code",
  description:
    "Static analysis of one file: imports, exports, declared functions/classes, line count, TODO markers and bracket balance. Cheap (no model call) and useful before refactoring.",
  category: "code",
  schema: z.object({ path: z.string().describe("Workspace-relative file path") }),
  async execute({ path }, ctx): Promise<ToolResult> {
    const file = await loadFile(ctx, path);
    if (file.content === null) return { ok: false, summary: `${file.path} tidak ada`, error: `File ${file.path} tidak ditemukan.` };
    const lines = file.content.split("\n");
    const imports = Array.from(file.content.matchAll(/^\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gm)).map((match) => ({
      specifiers: match[1].replace(/\s+/g, " ").trim().slice(0, 120),
      from: match[2],
    }));
    const exports = Array.from(file.content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g)).map((match) => match[1]);
    const declarations = Array.from(file.content.matchAll(/(?:^|\s)(?:async\s+)?function\s+([A-Za-z0-9_$]+)|(?:^|\s)class\s+([A-Za-z0-9_$]+)/g)).map((match) => match[1] || match[2]);
    const todos = lines.map((line, index) => ({ line: index + 1, text: line.trim() })).filter((entry) => /TODO|FIXME/.test(entry.text));
    const balance = file.content.length < 200_000 ? bracketBalance(file.content) : { balanced: true };
    return {
      ok: true,
      summary: `${file.path}: ${lines.length} baris, ${imports.length} import, ${declarations.length} deklarasi`,
      data: {
        path: file.path,
        lines: lines.length,
        bytes: file.content.length,
        imports,
        exports,
        declarations,
        todos,
        balanced: balance.balanced,
        balanceIssue: balance.message ?? null,
      },
    };
  },
});

const debugCode = defineTool({
  name: "debug_code",
  description:
    "Diagnose a bug in a file using the model, optionally applying a fix. Pass the observed error or symptom. With apply_fix=true the corrected file is written to the workspace and the diff returned.",
  category: "code",
  schema: z.object({
    path: z.string().describe("Workspace-relative file path"),
    problem: z.string().describe("Symptom, error message or failing behaviour"),
    apply_fix: z.boolean().optional().describe("Write the corrected file to the workspace"),
  }),
  async execute({ path, problem, apply_fix }, ctx): Promise<ToolResult> {
    const file = await loadFile(ctx, path);
    if (file.content === null) return { ok: false, summary: `${file.path} tidak ada`, error: `File ${file.path} tidak ditemukan.` };
    const prompt = [
      `FILE: ${file.path}`,
      "```",
      file.content.slice(0, 50_000),
      "```",
      "",
      `PROBLEM: ${problem}`,
      "",
      apply_fix
        ? "Return one short diagnosis paragraph, then the COMPLETE corrected file inside a single ``` fenced block. Change only what the fix requires."
        : "Return a diagnosis: root cause, the exact lines involved, and the minimal suggested change. Do not paste the whole file.",
    ].join("\n");
    const { text, usage } = await ctx.complete(prompt, { system: CODE_SYSTEM, maxTokens: apply_fix ? 6000 : 1200 });
    if (!apply_fix) {
      return { ok: true, summary: `Diagnosis ${file.path}`, data: { path: file.path, diagnosis: text }, usage };
    }
    const fixed = extractFencedBlock(text);
    if (!fixed) {
      return { ok: false, summary: "Model tidak mengembalikan kode", error: "Respons model tidak berisi blok kode. Coba lagi atau minta perbaikan manual.", data: { diagnosis: text }, usage };
    }
    await writeProjectFile(ctx.projectId, file.path, fixed);
    return {
      ok: true,
      summary: `Memperbaiki ${file.path}`,
      data: { path: file.path, diagnosis: text.split("```")[0].trim().slice(0, 2000) },
      filesChanged: [{ path: file.path, before: file.content, after: fixed }],
      usage,
    };
  },
});

const refactorCode = defineTool({
  name: "refactor_code",
  description:
    "Refactor a file according to an instruction (rename, split, simplify, convert style). With apply=true the rewritten file is saved; otherwise the proposal is returned only.",
  category: "code",
  schema: z.object({
    path: z.string().describe("Workspace-relative file path"),
    instruction: z.string().describe("What to change, in natural language"),
    apply: z.boolean().optional().describe("Save the refactored file"),
  }),
  async execute({ path, instruction, apply }, ctx): Promise<ToolResult> {
    const file = await loadFile(ctx, path);
    if (file.content === null) return { ok: false, summary: `${file.path} tidak ada`, error: `File ${file.path} tidak ditemukan.` };
    const prompt = [
      `FILE: ${file.path}`,
      "```",
      file.content.slice(0, 50_000),
      "```",
      "",
      `INSTRUCTION: ${instruction}`,
      "",
      apply
        ? "Apply the refactor and return the COMPLETE new file in a single ``` fenced block, nothing else."
        : "Describe the refactor plan with concrete code snippets. Do not paste the whole file.",
    ].join("\n");
    const { text, usage } = await ctx.complete(prompt, { system: CODE_SYSTEM, maxTokens: apply ? 6000 : 1500 });
    if (!apply) {
      return { ok: true, summary: `Rencana refactor ${file.path}`, data: { path: file.path, plan: text }, usage };
    }
    const next = extractFencedBlock(text);
    if (!next) return { ok: false, summary: "Model tidak mengembalikan kode", error: "Tidak ada blok kode dalam respons.", usage };
    await writeProjectFile(ctx.projectId, file.path, next);
    return {
      ok: true,
      summary: `Refactor ${file.path} selesai`,
      data: { path: file.path },
      filesChanged: [{ path: file.path, before: file.content, after: next }],
      usage,
    };
  },
});

const reviewCode = defineTool({
  name: "review_code",
  description:
    "Review one or more files for bugs, dead code, security issues and consistency. Pass an empty paths array to review up to eight text files in the project.",
  category: "code",
  schema: z.object({
    paths: z.array(z.string()).optional().describe("Files to review; omit to review the project's text files"),
    focus: z.string().optional().describe("Optional focus, e.g. accessibility or performance"),
  }),
  async execute({ paths, focus }, ctx): Promise<ToolResult> {
    let targets = paths && paths.length ? paths : (await listProjectFiles(ctx.projectId)).filter((entry) => entry.isText && entry.size < 60_000).slice(0, 8).map((entry) => entry.path);
    if (!targets.length) return { ok: false, summary: "Tidak ada file untuk direview", error: "Workspace kosong." };
    const blocks: string[] = [];
    let budget = 45_000;
    for (const target of targets.slice(0, 8)) {
      const file = await loadFile(ctx, target);
      if (file.content === null) continue;
      const slice = file.content.slice(0, Math.max(2000, Math.min(file.content.length, budget)));
      budget -= slice.length;
      blocks.push(`FILE: ${file.path}\n\`\`\`\n${slice}\n\`\`\``);
      if (budget <= 2000) break;
    }
    const prompt = [blocks.join("\n\n"), "", `TASK: review these files${focus ? ` focusing on ${focus}` : ""}. List findings ordered by severity with file and line references, then a short list of concrete fixes. Skip praise.`].join("\n");
    const { text, usage } = await ctx.complete(prompt, { system: CODE_SYSTEM, maxTokens: 2000 });
    return { ok: true, summary: `Review ${blocks.length} file`, data: { reviewed: targets, review: text }, usage };
  },
});

const explainCode = defineTool({
  name: "explain_code",
  description: "Explain what a file does, in plain language, for the user. Uses the model.",
  category: "code",
  schema: z.object({
    path: z.string().describe("Workspace-relative file path"),
    level: z.enum(["ringkas", "detail"]).optional().describe("Explanation depth"),
  }),
  async execute({ path, level }, ctx): Promise<ToolResult> {
    const file = await loadFile(ctx, path);
    if (file.content === null) return { ok: false, summary: `${file.path} tidak ada`, error: `File ${file.path} tidak ditemukan.` };
    const prompt = [`FILE: ${file.path}`, "```", file.content.slice(0, 40_000), "```", "", `TASK: explain this file ${level === "detail" ? "in detail, section by section" : "in a short paragraph plus key points"}.`].join("\n");
    const { text, usage } = await ctx.complete(prompt, { system: CODE_SYSTEM, maxTokens: 1200 });
    return { ok: true, summary: `Penjelasan ${file.path}`, data: { path: file.path, explanation: text }, usage };
  },
});

export const codeTools: AgentTool[] = [analyzeCode, debugCode, refactorCode, reviewCode, explainCode];
