import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { withSecurityHeaders } from "@/lib/auth/headers";
import { sameOrigin } from "@/lib/auth/require";
import { errorResponse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return withSecurityHeaders(errorResponse("Asal permintaan tidak diizinkan.", 403));

  const response = NextResponse.json({ ok: true });
  // Overwrite with an empty value and an immediate expiry so the browser drops it.
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return withSecurityHeaders(response);
}
