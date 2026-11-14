/**
 * Cloud mirror of every project and conversation.
 *
 * The working copy still lives in the browser (that is what makes the workspace survive
 * a serverless function), but each project is registered here with its owner, and every
 * message is appended here as it happens. Two consequences the owner asked for: history
 * is still there after a restart, and a project id can only be read by the account that
 * owns it.
 */
import { randomUUID } from "node:crypto";
import { redis, redisPipeline, redisEval, hgetall, hashToObject } from "./redis";
import { K } from "./keys";

export interface CloudProject {
  id: string;
  ownerId: string;
  name: string;
  stack?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface CloudMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  at: number;
}

function toProject(raw: Record<string, string> | null): CloudProject | null {
  if (!raw || !raw.id) return null;
  return {
    id: raw.id,
    ownerId: raw.ownerId || "",
    name: raw.name || "Untitled",
    stack: raw.stack || undefined,
    model: raw.model || undefined,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    messageCount: Number(raw.messageCount || "0") || 0,
  };
}

/**
 * Claims an unowned project for a user, atomically. Returns the owner id, which is
 * either the user who just claimed it or whoever held it before. A project that is
 * already owned by another account is never reassigned.
 */
async function claim(projectId: string, userId: number | string): Promise<string> {
  const owner = await redisEval<string>(
    "local o = redis.call('HGET', KEYS[1], 'ownerId') if (not o) or o == '' then redis.call('HSET', KEYS[1], 'ownerId', ARGV[1]) return ARGV[1] end return o",
    [K.project(String(projectId))],
    [String(userId)],
  );
  return String(owner);
}

export async function registerProject(input: {
  id?: string;
  ownerId: string;
  name: string;
  stack?: string;
  model?: string;
}): Promise<CloudProject> {
  const id = input.id || randomUUID();
  const now = new Date().toISOString();
  await redisEval<string>(
    "if redis.call('EXISTS', KEYS[1]) == 0 then redis.call('HSET', KEYS[1], 'id', ARGV[1], 'ownerId', ARGV[2], 'name', ARGV[3], 'createdAt', ARGV[4], 'updatedAt', ARGV[4], 'messageCount', '0') else redis.call('HSET', KEYS[1], 'updatedAt', ARGV[4]) end return 'OK'",
    [K.project(id)],
    [id, input.ownerId, input.name, now],
  );
  if (input.stack) await redis("HSET", K.project(id), "stack", input.stack);
  if (input.model) await redis("HSET", K.project(id), "model", input.model);
  await redis("SADD", K.userProjects(input.ownerId), id);
  await redis("SADD", K.projects, id);
  const project = await getProject(id);
  if (!project) throw new Error("Gagal menyimpan project.");
  return project;
}

export async function getProject(id: string): Promise<CloudProject | null> {
  return toProject(await hgetall(K.project(id)));
}

/**
 * Authorises access to a project. New ids are claimed by the first account that opens
 * them (the browser already owns those workspaces); anything claimed by somebody else
 * is reported as missing so ids cannot be probed.
 */
export async function authorizeProject(projectId: string, userId: string, isAdmin = false): Promise<{ ok: boolean; ownerId?: string }> {
  const owner = await claim(projectId, userId);
  if (isAdmin) return { ok: true, ownerId: owner };
  return { ok: owner === userId, ownerId: owner };
}

export async function listProjectsFor(userId: string): Promise<CloudProject[]> {
  const ids = await redis<string[]>("SMEMBERS", K.userProjects(userId));
  if (!ids || ids.length === 0) return [];
  const rows = await redisPipeline(ids.map((id) => ["HGETALL", K.project(id)]));
  return rows
    .map((row) => toProject(hashToObject(row)))
    .filter((row): row is CloudProject => Boolean(row) && (row as CloudProject).ownerId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function touchProject(id: string, patch: Partial<Pick<CloudProject, "name" | "model" | "stack">> = {}): Promise<void> {
  const fields: (string | number)[] = ["HSET", K.project(id), "updatedAt", new Date().toISOString()];
  if (patch.name) fields.push("name", patch.name);
  if (patch.model) fields.push("model", patch.model);
  if (patch.stack) fields.push("stack", patch.stack);
  await redis(...(fields as [string, ...(string | number)[]]));
}

export async function appendMessages(
  projectId: string,
  ownerId: string,
  messages: { id?: string; role: "user" | "assistant" | "system"; content: string; createdAt?: string }[],
  retention = 60,
): Promise<number> {
  if (messages.length === 0) return 0;
  const now = Date.now();
  const rows = messages.map((message, index) => {
    const record: CloudMessage = {
      id: message.id || randomUUID(),
      role: message.role,
      content: message.content,
      createdAt: message.createdAt || new Date(now + index).toISOString(),
      at: now + index,
    };
    return JSON.stringify(record);
  });
  const commands: (string | number)[][] = [["RPUSH", K.projectMessages(projectId), ...rows]];
  commands.push(["LTRIM", K.projectMessages(projectId), -retention, -1]);
  commands.push(["HSET", K.project(projectId), "updatedAt", new Date().toISOString()]);
  commands.push(["HINCRBY", K.project(projectId), "messageCount", rows.length]);
  commands.push(["HINCRBY", K.userStats(ownerId), "messages", rows.length]);
  commands.push(["HSET", K.userStats(ownerId), "lastActiveAt", new Date().toISOString()]);
  await redisPipeline(commands);
  return rows.length;
}

export async function getMessages(projectId: string, limit = 60): Promise<CloudMessage[]> {
  const rows = await redis<string[]>("LRANGE", K.projectMessages(projectId), -Math.max(1, Math.min(limit, 500)), -1);
  return (rows || [])
    .map((row) => {
      try {
        return JSON.parse(row) as CloudMessage;
      } catch {
        return null;
      }
    })
    .filter((row): row is CloudMessage => Boolean(row));
}

/** Removes the stored conversation of one project. The project and its files stay. */
export async function clearMessages(projectId: string): Promise<void> {
  await redis("DEL", K.projectMessages(projectId));
}

export async function deleteProject(projectId: string, ownerId: string): Promise<void> {
  await redisPipeline([
    ["DEL", K.project(projectId)],
    ["DEL", K.projectMessages(projectId)],
    ["SREM", K.userProjects(ownerId), projectId],
    ["SREM", K.projects, projectId],
  ]);
}

/** Removes the projects and messages of a deleted account (used with explicit confirmation). */
export async function purgeUserProjects(userId: string): Promise<number> {
  const ids = await redis<string[]>("SMEMBERS", K.userProjects(userId));
  const commands: (string | number)[][] = ids.map((id) => ["DEL", K.projectMessages(id)]);
  commands.push(...ids.map((id): (string | number)[] => ["DEL", K.project(id)]));
  commands.push(["DEL", K.userProjects(userId)]);
  commands.push(["DEL", K.userStats(userId)]);
  if (commands.length > 0) await redisPipeline(commands);
  return ids.length;
}

export async function systemCounters(): Promise<{ projects: number; users: number; keys: number; messages: number }> {
  const [users, keys, projects, messageCounts] = await Promise.all([
    redis<number>("SCARD", K.users),
    redis<number>("SCARD", K.apiKeys),
    redis<number>("SCARD", K.projects),
    redis<string[]>("SMEMBERS", K.projects),
  ]);
  let messages = 0;
  const ids = messageCounts || [];
  if (ids.length > 0) {
    const rows = await redisPipeline(ids.map((id) => ["HGET", K.project(id), "messageCount"]));
    messages = rows.reduce<number>((total, value) => total + (Number(value || 0) || 0), 0);
  }
  return { projects: Number(projects || 0), users: Number(users || 0), keys: Number(keys || 0), messages };
}

/**
 * Mirrors one finished message into the cloud history.
 *
 * The id comes from the workspace message, so a continuation slice that extends the same
 * answer updates the last cloud entry instead of pushing a duplicate one.
 */
export async function mirrorMessage(
  projectId: string,
  ownerId: string,
  message: { id: string; role: "user" | "assistant" | "system"; content: string; createdAt?: string },
): Promise<void> {
  const key = K.projectMessages(projectId);
  const lastRaw = await redis<string | null>("LINDEX", key, -1);
  const record: CloudMessage = {
    id: message.id,
    role: message.role,
    content: (message.content || "").slice(0, 200_000),
    createdAt: message.createdAt || new Date().toISOString(),
    at: Date.now(),
  };
  if (lastRaw) {
    try {
      const last = JSON.parse(lastRaw) as CloudMessage;
      if (last.id === record.id) {
        await redis("LSET", key, -1, JSON.stringify(record));
        return;
      }
    } catch {
      /* fall through to a normal append */
    }
  }
  await redisPipeline([
    ["RPUSH", key, JSON.stringify(record)],
    ["LTRIM", key, -60, -1],
    ["HINCRBY", K.project(projectId), "messageCount", 1],
    ["HSET", K.project(projectId), "updatedAt", new Date().toISOString()],
    ["HINCRBY", K.userStats(ownerId), "messages", 1],
    ["HSET", K.userStats(ownerId), "lastActiveAt", new Date().toISOString()],
  ]);
}
