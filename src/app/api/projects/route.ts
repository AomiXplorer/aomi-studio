import { z } from "zod";
import { createProject, listProjects, type ProjectMeta } from "@/lib/workspace/service";
import { scaffold, TEMPLATES, type TemplateId } from "@/lib/workspace/templates";
import { aiConfig } from "@/lib/ai/config";
import { json, parseBody, serverError } from "@/lib/api";
import { requireAccount } from "@/lib/auth/require";
import { listProjectsFor, registerProject } from "@/lib/db/projects";
import { bumpStats } from "@/lib/db/users";
import { redisConfigured } from "@/lib/db/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Projects come from two places: the workspace store the browser owns (files included)
 * and the cloud index in Redis, which is what makes a project list survive a restart or
 * a second device. They are merged by id so nothing is listed twice.
 */
export async function GET() {
  const gate = await requireAccount();
  if (gate.error) return gate.error;

  try {
    const local = await listProjects();
    let cloud: ProjectMeta[] = [];
    if (redisConfigured()) {
      const rows = await listProjectsFor(gate.account.user.id);
      const known = new Set(local.map((project) => project.id));
      cloud = rows
        .filter((row) => !known.has(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name,
          description: "",
          stack: row.stack || "blank",
          model: row.model || aiConfig.defaultModel,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
    }
    return json({ projects: [...local, ...cloud], templates: TEMPLATES });
  } catch (error) {
    return serverError(error);
  }
}

const templateIds = TEMPLATES.map((template) => template.id) as [TemplateId, ...TemplateId[]];

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
  template: z.enum(templateIds).optional(),
  model: z.string().optional(),
  /** The browser may generate the id so it can write files before the server replies. */
  id: z.string().min(6).max(64).optional(),
});

export async function POST(request: Request) {
  const gate = await requireAccount();
  if (gate.error) return gate.error;

  const parsed = await parseBody(request, createSchema);
  if (parsed.error) return parsed.error;
  try {
    const template = (parsed.data.template || "blank") as TemplateId;
    const files = template === "blank" ? undefined : scaffold(template, parsed.data.name);
    const project = await createProject({
      name: parsed.data.name,
      description: parsed.data.description,
      stack: template,
      model: parsed.data.model || aiConfig.defaultModel,
      files,
      id: parsed.data.id,
    });

    if (redisConfigured()) {
      await registerProject({
        id: project.id,
        ownerId: gate.account.user.id,
        name: project.name,
        stack: project.stack,
        model: project.model,
      });
      await bumpStats(gate.account.user.id, { chats: 1 });
    }

    return json({ project });
  } catch (error) {
    return serverError(error);
  }
}
