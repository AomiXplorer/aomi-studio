/**
 * Delivery log for the one transactional email the purchase flow sends.
 *
 * A row is written before the attempt and updated after it, so a crash between "account
 * created" and "email sent" still leaves evidence the owner can act on, and a retry never
 * has to guess whether the message went out.
 */
import { randomUUID } from "node:crypto";
import { hashToObject, redis, redisPipeline } from "./redis";
import { K } from "./keys";

export type MailState = "queued" | "sent" | "failed";

export interface MailRecord {
  id: string;
  orderId: string;
  userId: string;
  to: string;
  subject: string;
  status: MailState;
  error: string;
  attempts: number;
  providerId: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string;
}

const EMPTY: MailRecord = {
  id: "",
  orderId: "",
  userId: "",
  to: "",
  subject: "",
  status: "queued",
  error: "",
  attempts: 0,
  providerId: "",
  createdAt: "",
  updatedAt: "",
  sentAt: "",
};

function toRecord(raw: Record<string, string> | null): MailRecord | null {
  if (!raw || !raw.id) return null;
  return { ...EMPTY, ...raw, attempts: Number(raw.attempts || 0) } as MailRecord;
}

export async function createMail(input: { orderId: string; userId: string; to: string; subject: string }): Promise<MailRecord> {
  const id = randomUUID();
  const at = new Date().toISOString();
  const record: MailRecord = { ...EMPTY, id, ...input, status: "queued", createdAt: at, updatedAt: at };
  await redisPipeline([
    ["HSET", K.mail(id), ...Object.entries(record).flatMap(([key, value]) => [key, String(value)])],
    ["ZADD", K.mails, Date.now(), id],
    ["EXPIRE", K.mail(id), 60 * 60 * 24 * 365],
  ]);
  return record;
}

export async function updateMail(id: string, patch: Partial<MailRecord>): Promise<void> {
  const flat = Object.entries({ ...patch, updatedAt: new Date().toISOString() }).flatMap(([key, value]) => [key, String(value ?? "")]);
  await redis("HSET", K.mail(id), ...flat);
}

export async function listMails(limit = 100): Promise<MailRecord[]> {
  const ids = await redis<string[]>("ZREVRANGE", K.mails, 0, Math.max(0, limit - 1));
  if (!ids || ids.length === 0) return [];
  const rows = await redisPipeline(ids.map((id) => ["HGETALL", K.mail(id)]));
  return rows.map((row) => toRecord(hashToObject(row))).filter((row): row is MailRecord => Boolean(row));
}

/** Latest delivery attempt for an order, newest first. */
export async function latestMailForOrder(orderId: string, limit = 50): Promise<MailRecord | null> {
  const rows = await listMails(limit);
  return rows.find((row) => row.orderId === orderId) || null;
}
