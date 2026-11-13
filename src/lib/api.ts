import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init);
}

export function errorResponse(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { message, ...extra } }, { status });
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: errorResponse("Body harus JSON yang valid.", 400) };
  }
  try {
    return { data: schema.parse(raw) };
  } catch (error) {
    if (error instanceof ZodError) {
      const detail = error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
      return { error: errorResponse(`Validasi gagal: ${detail}`, 422) };
    }
    return { error: errorResponse("Body tidak valid.", 400) };
  }
}

export function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
  const code = (error as { code?: string }).code;
  // Workspace/path guard failures are client mistakes, not server faults.
  if (error instanceof Error && (error.name === "WorkspacePathError" || /tidak ditemukan|tidak valid|melebihi batas|tidak diizinkan/i.test(error.message))) {
    return NextResponse.json({ error: { message, code: code || "invalid_request" } }, { status: 400 });
  }
  const status = (error as { status?: number }).status;
  const httpStatus = typeof status === "number" && status >= 400 && status < 600 ? status : 500;
  return NextResponse.json({ error: { message, code } }, { status: httpStatus });
}
