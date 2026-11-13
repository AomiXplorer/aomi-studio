import { writeProjectFile, getProject, listProjectFiles } from "@/lib/workspace/service";
import { MAX_FILE_BYTES } from "@/lib/workspace/paths";
import { errorResponse, json, serverError } from "@/lib/api";
import { requireSession } from "@/lib/auth/require";

export const runtime = "nodejs";

const ALLOWED = [/^image\/(png|jpeg|webp|gif|svg\+xml)$/, /^text\//, /^application\/(json|pdf|zip)$/];

export async function POST(request: Request) {
  const gate = await requireSession();
  if (gate.error) return gate.error;

  try {
    const form = await request.formData();
    const projectId = String(form.get("projectId") || "");
    const file = form.get("file");
    if (!projectId) return errorResponse("projectId wajib diisi.", 400);
    if (!(file instanceof File)) return errorResponse("File tidak ditemukan di form.", 400);
    if (file.size > MAX_FILE_BYTES) return errorResponse(`Ukuran file maksimal ${MAX_FILE_BYTES / 1024 / 1024} MB.`, 413);
    if (!ALLOWED.some((pattern) => pattern.test(file.type))) {
      return errorResponse(`Tipe file ${file.type || "tidak dikenal"} tidak diizinkan.`, 415);
    }
    if (!(await getProject(projectId))) return errorResponse("Project tidak ditemukan.", 404);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "upload";
    const existing = await listProjectFiles(projectId);
    let path = `uploads/${safeName}`;
    let counter = 1;
    while (existing.some((entry) => entry.path === path)) {
      path = `uploads/${safeName.replace(/(\.[^.]+)?$/, `-${counter}$1`)}`;
      counter += 1;
    }
    await writeProjectFile(projectId, path, new Uint8Array(await file.arrayBuffer()));
    return json({ path, name: safeName, size: file.size, type: file.type });
  } catch (error) {
    return serverError(error);
  }
}
