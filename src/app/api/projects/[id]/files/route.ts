import { z } from "zod";
import { listProjectFiles, readProjectFile, writeProjectFile, deleteProjectFile, renameProjectFile, mimeForPath } from "@/lib/workspace/service";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";
import { requireProject } from "@/lib/db/guard";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requireProject(id);
  if (gate.error) return gate.error;
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  const download = url.searchParams.get("download") === "1";
  try {
    if (path) {
      const file = await readProjectFile(id, path);
      if (!file) return errorResponse(`File ${path} tidak ditemukan.`, 404);
      if (download) {
        const bytes = file.encoding === "utf8" ? Buffer.from(file.content, "utf8") : Buffer.from(file.content, "base64");
        return new Response(new Uint8Array(bytes), {
          headers: {
            "Content-Type": file.mime,
            "Content-Disposition": `attachment; filename="${file.path.split("/").pop()}"`,
            "Content-Length": String(bytes.byteLength),
          },
        });
      }
      return json({ file, mime: mimeForPath(file.path) });
    }
    return json({ files: await listProjectFiles(id) });
  } catch (error) {
    return serverError(error);
  }
}

const writeSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  encoding: z.enum(["utf8", "base64"]).optional(),
});

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requireProject(id);
  if (gate.error) return gate.error;
  const parsed = await parseBody(request, writeSchema);
  if (parsed.error) return parsed.error;
  try {
    const before = await readProjectFile(id, parsed.data.path);
    const bytes =
      parsed.data.encoding === "base64"
        ? new Uint8Array(Buffer.from(parsed.data.content.replace(/^data:[^,]+,/, ""), "base64"))
        : parsed.data.content;
    const result = await writeProjectFile(id, parsed.data.path, bytes);
    return json({ ok: true, result, before: before?.encoding === "utf8" ? before.content : null });
  } catch (error) {
    return serverError(error);
  }
}

const moveSchema = z.object({ from: z.string().min(1), to: z.string().min(1) });

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requireProject(id);
  if (gate.error) return gate.error;
  const parsed = await parseBody(request, moveSchema);
  if (parsed.error) return parsed.error;
  try {
    return json({ ok: true, moved: await renameProjectFile(id, parsed.data.from, parsed.data.to) });
  } catch (error) {
    return serverError(error);
  }
}

const deleteSchema = z.object({ path: z.string().min(1) });

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requireProject(id);
  if (gate.error) return gate.error;
  const parsed = await parseBody(request, deleteSchema);
  if (parsed.error) return parsed.error;
  try {
    await deleteProjectFile(id, parsed.data.path);
    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
