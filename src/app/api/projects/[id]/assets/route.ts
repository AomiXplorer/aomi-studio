import { z } from "zod";
import { deleteAsset, listAssets, saveAsset } from "@/lib/workspace/service";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";
import { requireProject } from "@/lib/db/guard";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requireProject(id);
  if (gate.error) return gate.error;
  try {
    return json({ assets: await listAssets(id) });
  } catch (error) {
    return serverError(error);
  }
}

const assetSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["image", "audio"]),
  name: z.string().min(1).max(120),
  mime: z.string().min(3).max(80),
  dataUrl: z.string().startsWith("data:"),
  prompt: z.string().max(4000).optional(),
  model: z.string().max(120),
  voice: z.string().max(80).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requireProject(id);
  if (gate.error) return gate.error;
  const parsed = await parseBody(request, assetSchema);
  if (parsed.error) return parsed.error;
  try {
    const asset = await saveAsset(id, {
      id: parsed.data.id || crypto.randomUUID(),
      kind: parsed.data.kind,
      name: parsed.data.name,
      mime: parsed.data.mime,
      dataUrl: parsed.data.dataUrl,
      prompt: parsed.data.prompt || "",
      model: parsed.data.model,
      voice: parsed.data.voice,
      createdAt: new Date().toISOString(),
    });
    return json({ asset });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const gate = await requireProject(id);
  if (gate.error) return gate.error;
  const assetId = new URL(request.url).searchParams.get("assetId");
  if (!assetId) return errorResponse("assetId wajib diisi.", 400);
  try {
    await deleteAsset(id, assetId);
    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
