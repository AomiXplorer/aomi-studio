import { z } from "zod";
import { TEMPLATES, scaffold, type TemplateId } from "@/lib/workspace/templates";
import { errorResponse, parseBody, serverError } from "@/lib/api";
import { requireSession } from "@/lib/auth/require";

export const runtime = "nodejs";

const schema = z.object({
  template: z.enum(["blank", "static", "nextjs", "react-vite", "node-cli"]),
  name: z.string().min(1).max(120).optional(),
});

/**
 * Returns the template file map without touching storage. Used by client storage
 * mode, where the browser keeps the workspace instead of the server.
 */
export async function POST(request: Request) {
  const gate = await requireSession();
  if (gate.error) return gate.error;

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;
  const { template, name } = parsed.data;
  try {
    const files = scaffold(template as TemplateId, name || "Project");
    const meta = TEMPLATES.find((entry) => entry.id === template);
    return Response.json({
      stack: meta?.stack || "static",
      template,
      label: meta?.label || template,
      files: Object.entries(files).map(([path, content]) => ({ path, content })),
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function GET() {
  const gate = await requireSession();
  if (gate.error) return gate.error;

  return Response.json({ templates: TEMPLATES });
}

export async function PUT() {
  const gate = await requireSession();
  if (gate.error) return gate.error;

  return errorResponse("Gunakan POST untuk membuat scaffold.", 405);
}
