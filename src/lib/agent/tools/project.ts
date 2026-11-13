import { z } from "zod";
import { createProject, getProject, listProjectFiles, readProjectText, writeProjectFile } from "@/lib/workspace/service";
import { sanitizeRelPath } from "@/lib/workspace/paths";
import { TEMPLATES, scaffold, type TemplateId } from "@/lib/workspace/templates";
import { analyzeProject } from "@/lib/services/analysis";
import { resolveDependencies } from "@/lib/services/deps";
import { defineTool, type AgentTool, type ToolResult } from "./types";

const templateIds = TEMPLATES.map((template) => template.id) as [TemplateId, ...TemplateId[]];

const createProjectTool = defineTool({
  name: "create_project",
  description:
    "Create a brand-new project workspace and return its id. Use when the user asks for a separate app/website from scratch. Does not change the current project.",
  category: "project",
  schema: z.object({
    name: z.string().describe("Project name shown in the UI"),
    template: z.enum(templateIds).optional().describe("Starting scaffold"),
    description: z.string().optional(),
  }),
  async execute({ name, template, description }, ctx): Promise<ToolResult> {
    const chosen = (template || "blank") as TemplateId;
    const files = chosen === "blank" ? undefined : scaffold(chosen, name);
    const project = await createProject({ name, description, stack: chosen, model: ctx.model, files });
    return {
      ok: true,
      summary: `Project "${project.name}" dibuat (${files ? Object.keys(files).length : 0} file)`,
      data: { id: project.id, name: project.name, template: chosen, files: files ? Object.keys(files) : [], open_url: `/projects/${project.id}` },
    };
  },
});

const generateProjectTool = defineTool({
  name: "generate_project",
  description:
    "Scaffold the current workspace from a template (nextjs, react-vite, static, node-cli, blank). Writes complete, runnable starter files. Existing files with the same path are overwritten.",
  category: "project",
  schema: z.object({
    template: z.enum(templateIds).describe("Template to generate"),
    name: z.string().optional().describe("Project name used in titles and package.json"),
  }),
  async execute({ template, name }, ctx): Promise<ToolResult> {
    const project = await getProject(ctx.projectId);
    if (!project) return { ok: false, summary: "Project tidak ditemukan", error: "Project tidak ada." };
    if (template === "blank") {
      return { ok: false, summary: "Template blank tidak menulis file", error: "Pilih template lain, atau pakai create_file." };
    }
    const files = scaffold(template, name || project.name);
    const changes: { path: string; before: string | null; after: string | null }[] = [];
    for (const [path, content] of Object.entries(files)) {
      const before = await readProjectText(ctx.projectId, path);
      await writeProjectFile(ctx.projectId, path, content);
      changes.push({ path, before, after: content });
    }
    return {
      ok: true,
      summary: `Scaffold ${template} ditulis (${changes.length} file)`,
      data: { template, files: Object.keys(files) },
      filesChanged: changes,
    };
  },
});

const analyzeProjectTool = defineTool({
  name: "analyze_project",
  description:
    "Static analysis of the current project: stack, dependencies, scripts, entrypoints, TODOs, broken relative imports, empty files. No model call. Run it before planning changes.",
  category: "project",
  schema: z.object({}),
  async execute(_args, ctx): Promise<ToolResult> {
    const analysis = await analyzeProject(ctx.projectId);
    return {
      ok: true,
      summary: `${analysis.files} file · stack ${analysis.stack} · ${analysis.checks.filter((check) => check.level === "error").length} error`,
      data: analysis,
    };
  },
});

const inspectStructureTool = defineTool({
  name: "inspect_structure",
  description: "Return the project folder tree as text so you can reason about file relationships.",
  category: "project",
  schema: z.object({}),
  async execute(_args, ctx): Promise<ToolResult> {
    const analysis = await analyzeProject(ctx.projectId);
    return { ok: true, summary: `Struktur ${analysis.files} file`, data: { tree: analysis.tree, files: analysis.files } };
  },
});

const installDependenciesTool = defineTool({
  name: "install_dependencies",
  description:
    "Resolve npm package names against the registry, verify they exist and pin the latest version into package.json. Binaries are installed on the machine that unpacks the exported ZIP, not on the serverless host.",
  category: "project",
  schema: z.object({
    packages: z.array(z.string()).min(1).max(25).describe("Package names, e.g. [\"zod\",\"lucide-react\"]"),
  }),
  async execute({ packages }, ctx): Promise<ToolResult> {
    const resolved = await resolveDependencies(packages);
    const missing = resolved.filter((item) => !item.exists);
    if (missing.length === resolved.length) {
      return {
        ok: false,
        summary: "Tidak ada paket yang ditemukan di npm",
        error: `Paket tidak ditemukan: ${missing.map((item) => item.name).join(", ")}`,
        data: { resolved },
      };
    }
    const pkgPath = "package.json";
    const raw = await readProjectText(ctx.projectId, pkgPath);
    let pkg: { dependencies?: Record<string, string>; [key: string]: unknown } = {};
    if (raw) {
      try {
        pkg = JSON.parse(raw);
      } catch {
        return { ok: false, summary: "package.json tidak valid", error: "package.json bukan JSON valid. Perbaiki dulu dengan edit_file." };
      }
    }
    pkg.dependencies = pkg.dependencies || {};
    const added: string[] = [];
    for (const item of resolved) {
      if (!item.exists || !item.version) continue;
      pkg.dependencies[item.name] = `^${item.version}`;
      added.push(`${item.name}@^${item.version}`);
    }
    const content = JSON.stringify(pkg, null, 2);
    await writeProjectFile(ctx.projectId, pkgPath, content);
    return {
      ok: true,
      summary: added.length ? `package.json diperbarui: ${added.length} paket` : "Tidak ada paket valid",
      data: { resolved, added, note: "Jalankan npm install setelah project diekspor." },
      filesChanged: [{ path: pkgPath, before: raw, after: content }],
    };
  },
});

const exportProjectTool = defineTool({
  name: "export_project",
  description: "Build a real ZIP of the workspace and return a download URL for the user. Call this at the end of a build task.",
  category: "project",
  schema: z.object({}),
  async execute(_args, ctx): Promise<ToolResult> {
    const files = await listProjectFiles(ctx.projectId);
    if (!files.length) {
      return { ok: false, summary: "Workspace kosong", error: "Belum ada file untuk diekspor. Buat file dulu." };
    }
    return {
      ok: true,
      summary: `Siap diekspor: ${files.length} file`,
      data: {
        download_url: `/api/projects/${ctx.projectId}/export`,
        files: files.length,
        note: "ZIP dibuat saat tombol download diklik (streaming), bukan file palsu.",
      },
    };
  },
});

export const projectTools: AgentTool[] = [
  createProjectTool,
  generateProjectTool,
  analyzeProjectTool,
  inspectStructureTool,
  installDependenciesTool,
  exportProjectTool,
];
