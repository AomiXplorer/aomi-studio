import { NextResponse } from "next/server";
import { loadAuthConfig } from "@/lib/auth/config";
import { withSecurityHeaders } from "@/lib/auth/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public and deliberately boring: an uptime check learns the app is up and whether a login can
 * possibly work. Which source supplied the credentials stays private, it is shown to the signed-in
 * owner by /api/auth/session.
 */
export async function GET() {
  let authConfigured = false;
  try {
    const state = await loadAuthConfig();
    authConfigured = Boolean(state.config);
  } catch {
    authConfigured = false;
  }

  return withSecurityHeaders(
    NextResponse.json({ ok: true, service: "aomi", authConfigured, time: new Date().toISOString() }),
  );
}
