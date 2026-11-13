import { z } from "zod";
import { createProject, listProjects } from "@/lib/workspace/service";
import { scaffold, TEMPLATES, type TemplateId } from "@/lib/workspace/templates";
import { aiConfig } from "@/lib/ai/config";
import { json, parseBody, serverError } from "@/lib/api";
import { requireSession } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSession();
  if (gate.error) return gate.error;

  try {
    return json({ projects: await listProjects(), templates: TEMPLATES });
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
});

export async function POST(request: Request) {
  const gate = await requireSession();
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
    });
    return json({ project });
  } catch (error) {
    return serverError(error);
  }
}
