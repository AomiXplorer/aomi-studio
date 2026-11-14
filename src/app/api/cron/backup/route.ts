/**
 * Daily encrypted snapshot. Vercel Cron calls this with the CRON_SECRET it was given, so
 * the endpoint is useless to anyone who does not already hold that secret.
 */
import { NextResponse } from "next/server";
import { createBackup, backupStatus } from "@/lib/db/backup";
import { audit } from "@/lib/db/audit";
import { redisPing, redisConfigured } from "@/lib/db/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const direct = request.headers.get("x-cron-secret") || "";
  return bearer === secret || direct === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  return run();
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  return run();
}

async function run(): Promise<NextResponse> {
  const ping = redisConfigured() ? await redisPing() : { ok: false, latencyMs: 0, error: "not configured" };
  if (!ping.ok) {
    await audit({ actorType: "system", actorId: "cron", action: "backup.skipped", detail: ping.error || "database unreachable" });
    return NextResponse.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }

  const result = await createBackup("cron");
  if (result.error) {
    await audit({ actorType: "system", actorId: "cron", action: "backup.failed", detail: result.error });
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  await audit({ actorType: "system", actorId: "cron", action: "backup.created", target: result.meta?.path, detail: `${result.meta?.keys} keys` });
  const status = await backupStatus();
  return NextResponse.json({ ok: true, backup: result.meta, files: status.files });
}
