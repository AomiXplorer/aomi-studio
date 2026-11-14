/**
 * Append-only audit trail. Every sensitive action (login failure spikes, user changes,
 * API key changes, backup and restore, Telegram admin commands) lands here with who,
 * what, when and from where. Reads are capped so the log can never grow unbounded.
 */
import { randomUUID } from "node:crypto";
import { redis } from "./redis";
import { K } from "./keys";

export type ActorType = "owner" | "telegram" | "user" | "system";

export interface AuditEntry {
  id: string;
  at: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  target?: string;
  detail?: string;
  ip?: string;
}

const MAX_ENTRIES = 2000;

export async function audit(input: Omit<AuditEntry, "id" | "at">): Promise<AuditEntry> {
  const entry: AuditEntry = { id: randomUUID(), at: new Date().toISOString(), ...input };
  try {
    await redis("LPUSH", K.audit, JSON.stringify(entry));
    await redis("LTRIM", K.audit, 0, MAX_ENTRIES - 1);
  } catch {
    // Never fail a user action because the log hiccuped; the action already happened.
  }
  return entry;
}

export async function listAudit(limit = 50): Promise<AuditEntry[]> {
  const rows = await redis<string[]>("LRANGE", K.audit, 0, Math.max(0, Math.min(limit, 500) - 1));
  return (rows || [])
    .map((row) => {
      try {
        return JSON.parse(row) as AuditEntry;
      } catch {
        return null;
      }
    })
    .filter((row): row is AuditEntry => Boolean(row));
}
