import { z } from "zod";
import { buildProjectZip } from "@/lib/services/export";
import { prepareSession } from "@/lib/workspace/session";
import { runWithStore } from "@/lib/workspace/store";
import { errorResponse, parseBody, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

function zipResponse(zip: Awaited<ReturnType<typeof buildProjectZip>>) {
  return new Response(new Uint8Array(zip.buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.filename}"`,
      "Content-Length": String(zip.bytes),
      "Cache-Control": "no-store",
      "X-Aomi-Files": String(zip.files),
    },
  });
}

/** Streams a freshly built ZIP. Nothing is cached on disk. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    return zipResponse(await buildProjectZip(id));
  } catch (error) {
    if (error instanceof Error && /tidak ditemukan/.test(error.message)) return errorResponse(error.message, 404);
    return serverError(error);
  }
}

const schema = z.object({
  workspace: z.object({
    project: z.object({
      id: z.string().min(6).max(64),
      name: z.string().max(120).optional(),
      description: z.string().max(600).optional(),
      stack: z.string().max(40).optional(),
      model: z.string().max(120).optional(),
    }),
    files: z
      .array(
        z.object({
          path: z.string().min(1).max(300),
          content: z.string(),
          encoding: z.enum(["utf8", "base64"]).optional(),
        }),
      )
      .max(300),
  }),
});

/**
 * ZIP of a workspace the browser owns. Client storage mode posts the workspace,
 * then downloads exactly what the workspace holds.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;
  try {
    const session = await prepareSession(parsed.data.workspace);
    const zip = await (runWithStore(session.store, () => buildProjectZip(session.id)) as Promise<
      Awaited<ReturnType<typeof buildProjectZip>>
    >);
    return zipResponse(zip);
  } catch (error) {
    return serverError(error);
  }
}
