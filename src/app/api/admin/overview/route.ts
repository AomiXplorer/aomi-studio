/**
 * Everything the admin panel renders, in one guarded response.
 *
 * Admin only, and deliberately credential-free: provider keys appear as masks, never as
 * values, and no password hash leaves the database.
 */
import { json, serverError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/require";
import { listUsers, userStats } from "@/lib/db/users";
import { listApiKeys } from "@/lib/db/apikeys";
import { listAudit } from "@/lib/db/audit";
import { systemCounters } from "@/lib/db/projects";
import { backupStatus } from "@/lib/db/backup";
import { redisPing, redisConfigured } from "@/lib/db/redis";
import { readSettings } from "@/lib/db/settings";
import { encryptionReady } from "@/lib/crypto/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  try {
    const [users, keys, audit, counters, backup, settings, ping] = await Promise.all([
      listUsers(),
      listApiKeys(),
      listAudit(40),
      systemCounters(),
      backupStatus().catch(() => ({ last: null, files: 0, configured: false, encryption: false })),
      readSettings(),
      redisConfigured() ? redisPing() : Promise.resolve({ ok: false, latencyMs: 0, error: "not configured" }),
    ]);

    const enriched = await Promise.all(
      users.map(async (user) => ({
        ...user,
        stats: await userStats(user.id).catch(() => ({ chats: 0, messages: 0, lastActiveAt: null, projects: 0 })),
      })),
    );

    return json({
      me: { id: gate.account.user.id, username: gate.account.user.username, role: gate.account.user.role },
      users: enriched,
      keys,
      audit,
      counters,
      backup,
      settings,
      database: {
        configured: redisConfigured(),
        ok: ping.ok,
        latencyMs: ping.latencyMs,
        error: "error" in ping ? ping.error : undefined,
        encryption: encryptionReady(),
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
