import { NextResponse } from "next/server";
import { loadAuthConfig } from "@/lib/auth/config";
import { requireSession } from "@/lib/auth/require";
import { withSecurityHeaders } from "@/lib/auth/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSession();
  if (gate.error) return gate.error;
  // Only the signed-in owner learns whether the private repo or the env fallback answered.
  const state = await loadAuthConfig();
  return withSecurityHeaders(
    NextResponse.json({
      authenticated: true,
      user: { username: gate.claims.sub, role: gate.claims.role },
      expiresAt: new Date(gate.claims.exp * 1000).toISOString(),
      credentialSource: state.source,
    }),
  );
}
