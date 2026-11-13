import { NextResponse } from "next/server";
import { withSecurityHeaders } from "@/lib/auth/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, deliberately boring: lets an uptime check see the app is up without exposing state. */
export async function GET() {
  return withSecurityHeaders(NextResponse.json({ ok: true, service: "aomi", time: new Date().toISOString() }));
}
