import { z } from "zod";
import { deleteProject, getProject, touchProject } from "@/lib/workspace/service";
import { deleteProject as deleteCloudProject } from "@/lib/db/projects";
import { redisConfigured } from "@/lib/db/redis";
import { storageStatus } from "@/lib/workspace/store";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";
import { requireProject } from "@/lib/db/guard";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requireProject(id);
  if (gate.error) return gate.error;
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
  const gate = await requireProject(id);
  if (gate.error) return gate.error;
  const parsed = await parseBody(request, patchSchema);
  if (parsed.error) return parsed.error;
  try {
    const project = await touchProject(id, parsed.data);
    return json({ project });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * Deletes a project everywhere it exists: the workspace store the browser reads from and
 * the cloud index that keeps it in the list across devices. Without the second half a
 * deleted project kept reappearing, which is exactly what a delete button must not do.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requireProject(id);
  if (gate.error) return gate.error;
  try {
    await deleteProject(id);
    if (redisConfigured()) await deleteCloudProject(id, gate.account.user.id);
    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
