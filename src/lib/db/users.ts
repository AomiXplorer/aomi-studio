/**
 * User records live in Redis as a hash per user, with an index set and a unique
 * username reservation. Writes that must not interleave (session version, last login)
 * use atomic Redis commands rather than read-modify-write.
 *
 * One source of truth: the web panel and the Telegram bot both call this module, so an
 * account created from Telegram can log in immediately and a ban applies on the next
 * request.
 */
import { randomUUID } from "node:crypto";
import { bcryptHash, bcryptVerify, isBcryptHash } from "@/lib/auth/bcrypt";
import { verifyPassword, type ScryptRecord } from "@/lib/auth/password";
import { redis, redisPipeline, getJson, setJson, hgetall, hashToObject } from "./redis";
import { K } from "./keys";

export type Role = "admin" | "user";
export type Status = "active" | "banned";

export interface UserRecord {
  id: string;
  username: string;
  role: Role;
  status: Status;
  createdAt: string;
  lastLoginAt: string | null;
  createdBy: string;
  sessionVersion: number;
}

export interface RawUser extends UserRecord {
  passwordHash: string;
}

function toRecord(raw: Record<string, string> | null): RawUser | null {
  if (!raw || !raw.id) return null;
  return {
    id: raw.id,
    username: raw.username || "",
    role: (raw.role === "admin" ? "admin" : "user") as Role,
    status: (raw.status === "banned" ? "banned" : "active") as Status,
    createdAt: raw.createdAt || new Date().toISOString(),
    lastLoginAt: raw.lastLoginAt || null,
    createdBy: raw.createdBy || "system",
    sessionVersion: Number(raw.sessionVersion || "1") || 1,
    passwordHash: raw.passwordHash || "",
  };
}

export function publicUser(user: RawUser | UserRecord) {
  const { passwordHash: _hash, ...rest } = user as RawUser;
  return rest;
}

export async function getUserById(id: string): Promise<RawUser | null> {
  if (!id) return null;
  return toRecord(await hgetall(K.user(id)));
}

export async function getUserByUsername(username: string): Promise<RawUser | null> {
  const id = await redis<string | null>("GET", K.username(username.trim().toLowerCase()));
  return id ? getUserById(id) : null;
}

export async function listUsers(): Promise<UserRecord[]> {
  const ids = await redis<string[]>("SMEMBERS", K.users);
  if (!ids || ids.length === 0) return [];
  const rows = await redisPipeline(ids.map((id) => ["HGETALL", K.user(id)]));
  return rows
    .map((row) => toRecord(hashToObject(row)))
    .filter((row): row is RawUser => Boolean(row))
    .map(publicUser)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

interface CreateInput {
  username: string;
  password: string;
  role?: Role;
  createdBy: string;
}

/** Reserves the username atomically, then writes the record. */
export async function createUser(input: CreateInput): Promise<{ user: UserRecord } | { error: string }> {
  return createUserWithHash({ ...input, hash: await bcryptHash(input.password) });
}

/**
 * Same reservation, but with a hash the caller already computed. Telegram flows use this
 * so a half-finished "/adduser" conversation never holds a plaintext password anywhere.
 */
export async function createUserWithHash(input: {
  username: string;
  hash: string;
  role?: Role;
  createdBy: string;
}): Promise<{ user: UserRecord } | { error: string }> {
  const username = input.username.trim();
  const id = randomUUID();
  // SET ... NX returns "OK" when the name was free and nil when it was taken.
  const reserved = await redis<string | null>("SET", K.username(username.toLowerCase()), id, "NX");
  if (reserved === null || reserved === undefined) return { error: `Username "${username}" sudah dipakai.` };
  const hash = input.hash;
  const now = new Date().toISOString();
  await redisPipeline([
    [
      "HSET",
      K.user(id),
      "id", id,
      "username", username,
      "usernameLower", username.toLowerCase(),
      "passwordHash", hash,
      "role", input.role || "user",
      "status", "active",
      "createdAt", now,
      "createdBy", input.createdBy,
      "sessionVersion", "1",
    ],
    ["SADD", K.users, id],
  ]);
  const created = await getUserById(id);
  if (!created) return { error: "Gagal menyimpan user baru." };
  return { user: publicUser(created) };
}

export async function setPassword(userId: string, password: string): Promise<boolean> {
  return setPasswordHash(userId, await bcryptHash(password));
}

export async function setPasswordHash(userId: string, hash: string): Promise<boolean> {
  const updated = await redis<number>("HSET", K.user(userId), "passwordHash", hash);
  await bumpSessionVersion(userId);
  return updated >= 0;
}

export async function setStatus(userId: string, status: Status): Promise<void> {
  await redis("HSET", K.user(userId), "status", status);
  await bumpSessionVersion(userId);
}

export async function setRole(userId: string, role: Role): Promise<void> {
  await redis("HSET", K.user(userId), "role", role);
  await bumpSessionVersion(userId);
}

export async function renameUser(userId: string, username: string): Promise<{ error?: string }> {
  const current = await getUserById(userId);
  if (!current) return { error: "User tidak ditemukan." };
  const lower = username.trim().toLowerCase();
  if (lower !== current.username.toLowerCase()) {
    const reserved = await redis<string | null>("SET", K.username(lower), userId, "NX");
    if (reserved === null) return { error: `Username "${username}" sudah dipakai.` };
    await redis("DEL", K.username(current.username.toLowerCase()));
  }
  await redis("HSET", K.user(userId), "username", username.trim(), "usernameLower", lower);
  await bumpSessionVersion(userId);
  return {};
}

export async function deleteUser(userId: string): Promise<{ error?: string }> {
  const user = await getUserById(userId);
  if (!user) return { error: "User tidak ditemukan." };
  await redisPipeline([
    ["DEL", K.user(userId)],
    ["DEL", K.username(user.username.toLowerCase())],
    ["SREM", K.users, userId],
  ]);
  return {};
}

async function bumpSessionVersion(userId: string): Promise<void> {
  await redis("HINCRBY", K.user(userId), "sessionVersion", 1);
}

export async function touchLogin(userId: string): Promise<void> {
  await redis("HSET", K.user(userId), "lastLoginAt", new Date().toISOString());
}

export async function bumpStats(userId: string, adds: { chats?: number; messages?: number }): Promise<void> {
  const commands: (string | number)[][] = [];
  if (adds.chats) commands.push(["HINCRBY", K.userStats(userId), "chats", adds.chats]);
  if (adds.messages) commands.push(["HINCRBY", K.userStats(userId), "messages", adds.messages]);
  commands.push(["HSET", K.userStats(userId), "lastActiveAt", new Date().toISOString()]);
  await redisPipeline(commands);
}

export async function userStats(userId: string): Promise<{ chats: number; messages: number; lastActiveAt: string | null; projects: number }> {
  const raw = await hgetall(K.userStats(userId));
  const projects = await redis<number>("SCARD", K.userProjects(userId));
  return {
    chats: Number(raw?.chats || 0),
    messages: Number(raw?.messages || 0),
    lastActiveAt: raw?.lastActiveAt || null,
    projects: Number(projects || 0),
  };
}

/**
 * Verifies a password against either storage format. bcrypt records are compared with
 * bcrypt; a legacy scrypt record (the owner) is compared with the original verifier so
 * the owner keeps working without a migration step.
 */
export async function verifyUserPassword(user: RawUser | null, password: string): Promise<boolean> {
  if (!user || !user.passwordHash) {
    // Burn comparable time so an unknown username is not obviously faster.
    await verifyPassword(password, undefined);
    return false;
  }
  if (isBcryptHash(user.passwordHash)) return bcryptVerify(password, user.passwordHash);
  const record = scryptRecordFromString(user.passwordHash);
  if (!record) return false;
  return verifyPassword(password, record);
}

/** `scrypt$N$r$p$salt$key` as produced by scripts/hash-password.mjs. */
export function scryptRecordFromString(value: string): ScryptRecord | null {
  const parts = value.split("$");
  if (parts[0] !== "scrypt" || parts.length !== 6) return null;
  const [, n, r, p, salt, key] = parts;
  if (!salt || !key) return null;
  return { n: Number(n) || 16384, r: Number(r) || 8, p: Number(p) || 1, salt, key };
}

export function scryptRecordToString(record: ScryptRecord): string {
  return `scrypt$${record.n}$${record.r}$${record.p}$${record.salt}$${record.key}`;
}

/** Admins are counted before a demotion or deletion, so the last admin cannot be lost. */
export async function adminCount(): Promise<number> {
  const users = await listUsers();
  return users.filter((user) => user.role === "admin" && user.status === "active").length;
}

/** Idempotent first-boot marker, used for the audit trail and the panel banner. */
export async function markBoot(): Promise<{ firstRun: boolean; bootedAt: string }> {
  const existing = await getJson<{ bootedAt: string } | null>(K.boot, null);
  if (existing?.bootedAt) return { firstRun: false, bootedAt: existing.bootedAt };
  const bootedAt = new Date().toISOString();
  await setJson(K.boot, { bootedAt });
  return { firstRun: true, bootedAt };
}
