/**
 * Account resolution shared by the web panel and the Telegram bot.
 *
 * Two sources, one identity: the owner keeps the credential file in the private repo (so
 * a deletion of bot-managed data can never lock the owner out) while every other account
 * lives in Redis. On the owner's first sign-in the file is mirrored into Redis as an
 * admin record, after which the normal RBAC path applies to everyone.
 */
import { loadAuthConfig, findUser as findConfigUser, type AuthConfigState } from "./config";
import { scryptRecordToString, type RawUser, type UserRecord } from "@/lib/db/users";
import { getUserByUsername, getUserById, verifyUserPassword } from "@/lib/db/users";

export interface OwnerIdentity {
  username: string;
  record: string;
  displayName?: string;
}

export function ownerIdentity(state: AuthConfigState): OwnerIdentity | null {
  const first = state.config?.users?.[0];
  if (!first) return null;
  return {
    username: first.username,
    record: scryptRecordToString(first.scrypt),
    displayName: first.displayName,
  };
}

export type AuthOutcome =
  | { ok: true; user: RawUser; isOwner: boolean; source: AuthConfigState["source"] }
  | { ok: false; reason: "invalid" | "banned" | "unconfigured" | "password" };

/**
 * Verifies a username and password.
 *
 * Order matters: an existing database account is authoritative (bcrypt), and the owner
 * file is consulted as well, so a rotated owner password in the private repo keeps
 * working even if the mirrored hash in Redis is older.
 */
export async function authenticate(username: string, password: string): Promise<AuthOutcome> {
  const state = await loadAuthConfig();
  const owner = ownerIdentity(state);
  const wanted = username.trim();
  const wantedLower = wanted.toLowerCase();

  let record = await getUserByUsername(wanted);
  const configUser = findConfigUser(state.config, wantedLower);
  const isOwnerName = Boolean(owner && owner.username.toLowerCase() === wantedLower);

  if (!record && isOwnerName) {
    record = await materializeOwner(owner!, configUser?.displayName);
  }

  if (!record && !configUser) {
    // Cost the same as a real check so usernames cannot be enumerated by timing.
    await verifyUserPassword(null, password);
    return { ok: false, reason: "invalid" };
  }

  let passwordOk = await verifyUserPassword(record, password);

  // The owner's credential file is also authoritative, and wins over a stale mirror.
  if (!passwordOk && configUser) {
    const { verifyPassword } = await import("./password");
    passwordOk = await verifyPassword(password, configUser.scrypt);
    if (passwordOk && record) {
      const { redis } = await import("@/lib/db/redis");
      const { K } = await import("@/lib/db/keys");
      const { bcryptHash } = await import("./bcrypt");
      const hash = await bcryptHash(password);
      await redis("HSET", K.user(record.id), "passwordHash", hash);
    }
  }

  if (!passwordOk || !record) return { ok: false, reason: "invalid" };
  if (record.status === "banned") return { ok: false, reason: "banned" };
  return { ok: true, user: record, isOwner: isOwnerName, source: state.source };
}

/** Creates the admin mirror of the owner file record if it does not exist yet. */
export async function materializeOwner(owner: OwnerIdentity, displayName?: string): Promise<RawUser | null> {
  const { createUser, listUsers, getUserById } = await import("@/lib/db/users");
  const existing = await getUserByUsername(owner.username);
  if (existing) return existing;
  const created = await createUser({
    username: owner.username,
    // A random throwaway secret: the real verification goes through the owner file and
    // immediately rewrites this field with the real bcrypt hash on success.
    password: `owner-placeholder-${crypto.randomUUID()}`,
    role: "admin",
    createdBy: "owner-file",
  });
  if ("error" in created) {
    const all = await listUsers();
    const fallback = all.find((user) => user.username.toLowerCase() === owner.username.toLowerCase());
    return fallback ? await getUserById(fallback.id) : null;
  }
  if (displayName) return await getUserById(created.user.id);
  return await getUserById(created.user.id);
}

export async function accountForSession(sub: string, uid: string): Promise<{ user: RawUser; isOwner: boolean } | null> {
  const state = await loadAuthConfig();
  const owner = ownerIdentity(state);
  const isOwnerName = Boolean(owner && owner.username.toLowerCase() === sub.toLowerCase());
  let record = uid ? await getUserById(uid) : null;
  if (!record) record = await getUserByUsername(sub);
  if (!record && isOwnerName && owner) record = await materializeOwner(owner);
  if (!record) return null;
  return { user: record, isOwner: isOwnerName };
}

/**
 * Makes sure the owner has a database row.
 *
 * The credential file stays authoritative, but the panel and the bot both list accounts from
 * Redis, so the owner is mirrored in as soon as either surface needs the list. Safe to call
 * on every request: it only writes when the row is missing.
 */
export async function ensureOwnerAccount(): Promise<void> {
  try {
    const state = await loadAuthConfig();
    const owner = ownerIdentity(state);
    if (!owner) return;
    const existing = await getUserByUsername(owner.username);
    if (existing) return;
    await materializeOwner(owner);
  } catch {
    // A missing mirror must never break a panel read.
  }
}
