import { z } from "zod";
import { deleteProject, getProject, touchProject } from "@/lib/workspace/service";
import { storageStatus } from "@/lib/workspace/store";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const project = await getProject(id);
    if (!project) return errorResponse("Project tidak ditemukan.", 404);
    return json({ project, storage: storageStatus() });
  } catch (error) {
    return serverError(error);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(400).optional(),
  model: z.string().optional(),
  stack: z.string().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(request, patchSchema);
  if (parsed.error) return parsed.error;
  try {
    const project = await touchProject(id, parsed.data);
    return json({ project });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await deleteProject(id);
    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
