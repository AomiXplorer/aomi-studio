import { NextResponse } from "next/server";
import { loadAuthConfig } from "@/lib/auth/config";
import { requireAccount } from "@/lib/auth/require";
import { withSecurityHeaders } from "@/lib/auth/headers";
import { redisPing, redisConfigured } from "@/lib/db/redis";
import { userStats } from "@/lib/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAccount();
  if (gate.error) return gate.error;

  const state = await loadAuthConfig();
  const { user, isOwner } = gate.account;
  const stats = redisConfigured() ? await userStats(user.id).catch(() => null) : null;
  const database = redisConfigured() ? await redisPing() : { ok: false, latencyMs: 0 };

  return withSecurityHeaders(
    NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isOwner,
        createdAt: user.createdAt,
      },
      expiresAt: new Date(gate.account.claims.exp * 1000).toISOString(),
      credentialSource: state.source,
      database: { configured: redisConfigured(), ok: database.ok, latencyMs: database.latencyMs },
      stats,
    }),
  );
}
