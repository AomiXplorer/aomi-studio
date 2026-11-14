/**
 * What the product does when the provider balance runs out.
 *
 * The web shows one calm maintenance line instead of a provider stack trace, and the
 * owner is told once on Telegram. The mark expires on its own so a top-up needs no
 * manual cleanup, and a successful call clears it immediately.
 */
import { redis, getJson, redisConfigured } from "@/lib/db/redis";
import { sendMessage } from "@/lib/telegram/api";

export const QUOTA_KEY = "aomi:quota:exhausted";
const ALERT_KEY = "aomi:quota:alerted";
const MARK_TTL_SECONDS = 24 * 60 * 60;
const ALERT_COOLDOWN_SECONDS = 6 * 60 * 60;

export interface QuotaState {
  exhausted: boolean;
  since: string | null;
  detail: string | null;
}

const EMPTY: QuotaState = { exhausted: false, since: null, detail: null };

/** True for the shapes the router uses when the account cannot pay for a call. */
export function isQuotaError(error: unknown): boolean {
  const candidate = error as { code?: string; status?: number; message?: string } | null;
  if (!candidate) return false;
  if (candidate.code === "insufficient_quota") return true;
  if (candidate.status === 402) return true;
  const message = String(candidate.message || "");
  return /insufficient[_\s]quota|purchase_required|saldo|kuota|balance.*(low|habis)|402/i.test(message);
}

export async function readQuota(): Promise<QuotaState> {
  if (!redisConfigured()) return EMPTY;
  try {
    const stored = await getJson<QuotaState | null>(QUOTA_KEY, null);
    if (!stored || !stored.exhausted) return EMPTY;
    return stored;
  } catch {
    return EMPTY;
  }
}

async function alertOwner(detail: string): Promise<void> {
  const chatId = (process.env.TELEGRAM_ADMIN_ID || "").trim();
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return;
  // One alert per six hours: a retry loop must not turn into a Telegram flood.
  const fresh = await redis<string | null>("SET", ALERT_KEY, "1", "NX", "EX", ALERT_COOLDOWN_SECONDS).catch(() => null);
  if (fresh === null) return;
  const lines = [
    "<b>Limit provider habis</b>",
    "",
    "Aomi Studio sekarang menampilkan <i>Web Under maintenance</i> ke pengunjung.",
    "Isi ulang saldo Bangunweb, lalu web hidup lagi otomatis pada permintaan berikutnya.",
  ];
  if (detail) lines.push("", `Pesan provider: <code>${detail.slice(0, 300)}</code>`);
  await sendMessage(Number(chatId) || chatId, lines.join("\n")).catch(() => undefined);
}

export async function markQuotaExhausted(detail: string): Promise<QuotaState> {
  const state: QuotaState = { exhausted: true, since: new Date().toISOString(), detail: detail.slice(0, 300) };
  if (!redisConfigured()) {
    await alertOwner(detail);
    return state;
  }
  await redis("SET", QUOTA_KEY, JSON.stringify(state), "EX", MARK_TTL_SECONDS).catch(() => undefined);
  await alertOwner(detail);
  return state;
}

export async function clearQuota(): Promise<void> {
  if (!redisConfigured()) return;
  await redis("DEL", QUOTA_KEY).catch(() => undefined);
}
