/**
 * Multi-step conversations (/adduser asks for a username, then a password, then a
 * confirmation). State lives in Redis with a ten minute TTL.
 *
 * Secrets never sit in that state: a password is bcrypt-hashed and an API key is sealed
 * with AES-256-GCM before the flow records it, so an abandoned conversation leaves no
 * readable credential behind.
 */
import { redis, getJson, setJson } from "@/lib/db/redis";
import { K } from "@/lib/db/keys";
import type { SealedSecret } from "@/lib/crypto/secrets";
import type { Role } from "@/lib/db/users";

const TTL = 600;

export type Flow =
  | { kind: "sitemeta"; field: "title" | "description" }
  | { kind: "adduser"; step: "username" | "password" | "confirm"; username?: string; hash?: string; role?: Role }
  | { kind: "resetpassword"; step: "password" | "confirm"; userId: string; username: string; hash?: string }
  | { kind: "renameuser"; step: "username"; userId: string }
  | {
      kind: "addtoken";
      step: "provider" | "key" | "label" | "confirm";
      provider?: string;
      sealed?: SealedSecret;
      masked?: string;
      fingerprint?: string;
      label?: string;
    };

export async function readFlow(chatId: number | string): Promise<Flow | null> {
  return getJson<Flow | null>(K.telegramFlow(chatId), null);
}

export async function writeFlow(chatId: number | string, flow: Flow): Promise<void> {
  await setJson(K.telegramFlow(chatId), flow, TTL);
}

export async function clearFlow(chatId: number | string): Promise<void> {
  await redis("DEL", K.telegramFlow(chatId));
}

/** Per-chat throttle: a stuck loop cannot flood Telegram or the database. */
export async function throttled(chatId: number | string, perMinute = 30): Promise<boolean> {
  const key = K.telegramThrottle(chatId);
  const count = await redis<number>("INCR", key).catch(() => 0);
  if (count === 1) await redis("EXPIRE", key, 60).catch(() => null);
  return Number(count) > perMinute;
}
