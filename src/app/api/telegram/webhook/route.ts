/**
 * Telegram webhook.
 *
 * Public by necessity (Telegram cannot send a session cookie), so it authenticates the
 * caller twice: the secret token header that Telegram echoes back on every request, and
 * the admin id inside each update. A wrong secret is rejected before the payload is even
 * parsed, and every update is processed one at a time so two button presses cannot race.
 */
import { NextResponse } from "next/server";
import { handleUpdate } from "@/lib/telegram/handlers";
import { audit } from "@/lib/db/audit";
import { telegramConfigured } from "@/lib/telegram/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!telegramConfigured()) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN belum diatur." }, { status: 503 });
  }

  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_WEBHOOK_SECRET belum diatur." }, { status: 503 });
  }

  const provided = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (provided !== expected) {
    await audit({
      actorType: "system",
      actorId: "telegram-webhook",
      action: "telegram.webhook_rejected",
      detail: "secret token mismatch",
    });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  try {
    await handleUpdate(update as Parameters<typeof handleUpdate>[0]);
  } catch (error) {
    // Always answer 200: a non-2xx makes Telegram retry the same update forever.
    console.error("[telegram] handler error", error instanceof Error ? error.message : "unknown");
    await audit({
      actorType: "system",
      actorId: "telegram-webhook",
      action: "telegram.handler_error",
      detail: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "POST only" }, { status: 405 });
}
