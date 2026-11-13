import { buildProjectZip } from "@/lib/services/export";
import { errorResponse, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/** Streams a freshly built ZIP. Nothing is cached on disk. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const zip = await buildProjectZip(id);
    return new Response(new Uint8Array(zip.buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zip.filename}"`,
        "Content-Length": String(zip.bytes),
        "Cache-Control": "no-store",
        "X-Aomi-Files": String(zip.files),
      },
    });
  } catch (error) {
    if (error instanceof Error && /tidak ditemukan/.test(error.message)) return errorResponse(error.message, 404);
    return serverError(error);
  }
}
