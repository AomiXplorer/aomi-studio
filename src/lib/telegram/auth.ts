/**
 * Authorisation for the bot.
 *
 * One allowlist, checked on every message and on every button press. An id that is not on
 * the list gets a short refusal and an audit entry, and no screen is rendered for it, so a
 * stranger cannot even enumerate what the bot can do.
 */
import { audit } from "@/lib/db/audit";

export function adminIds(): string[] {
  // No fallback in code: an unset allowlist denies everyone rather than shipping an id.
  const raw = (process.env.TELEGRAM_ADMIN_ID || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isTelegramAdmin(userId: number | string | undefined): boolean {
  if (userId === undefined || userId === null) return false;
  return adminIds().includes(String(userId));
}

export async function recordRejection(userId: number | string | undefined, username: string | undefined, action: string): Promise<void> {
  await audit({
    actorType: "telegram",
    actorId: String(userId ?? "unknown"),
    action: "telegram.denied",
    target: action,
    detail: username ? `@${username}` : "no username",
  });
}
