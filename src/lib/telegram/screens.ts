/**
 * Every screen the bot can render, kept apart from the routing so the wording and the
 * keyboards can be reviewed in one place. No screen ever contains a password, a hash, a
 * session token or an unmasked API key.
 */
import { aiConfig } from "@/lib/ai/config";
import { listUsers, userStats, type UserRecord, getUserById } from "@/lib/db/users";
import { listApiKeys, activeKeyId } from "@/lib/db/apikeys";
import { listAudit } from "@/lib/db/audit";
import { systemCounters } from "@/lib/db/projects";
import { backupStatus } from "@/lib/db/backup";
import { redisPing, redisConfigured } from "@/lib/db/redis";
import { encryptionReady } from "@/lib/crypto/secrets";
import { readSettings } from "@/lib/db/settings";
import type { InlineButton } from "./api";
import { card, esc, when, ago, shortId, RULE } from "./ui";

export const mainMenu = (): InlineButton[][] => [
  [
    { text: "Users", callback_data: "m:users" },
    { text: "API keys", callback_data: "m:keys" },
  ],
  [
    { text: "Stats", callback_data: "m:stats" },
    { text: "Database", callback_data: "m:db" },
  ],
  [
    { text: "Backup", callback_data: "m:backup" },
    { text: "Audit log", callback_data: "m:audit" },
  ],
];

export function welcome(botName: string): string {
  return card([
    `<b>Aomi admin console</b>`,
    `bot @${esc(botName)}`,
    RULE,
    "Manage accounts, provider keys, database and backups from here.",
    "Everything you change applies to the web app immediately.",
    RULE,
    "<code>/help</code> for the full command list",
  ]);
}

export function help(): string {
  return card([
    "<b>Commands</b>",
    RULE,
    "<b>API keys</b>",
    "/addtoken · /listtoken · /changetoken · /deletetoken",
    "/activetoken · /tokenstatus",
    RULE,
    "<b>Users</b>",
    "/adduser · /listuser · /userinfo · /edituser",
    "/deleteuser · /resetpassword · /banuser · /unbanuser",
    RULE,
    "<b>System</b>",
    "/stats · /database · /userstats · /backup · /backupstatus · /audit",
    RULE,
    "<code>/cancel</code> stops any question that is waiting for an answer.",
  ]);
}

export async function usersList(): Promise<{ text: string; keyboard: InlineButton[][] }> {
  const users = await listUsers();
  if (users.length === 0) {
    return { text: "<b>No accounts yet</b>\nUse /adduser to create the first one.", keyboard: [[{ text: "Add user", callback_data: "u:new" }]] };
  }
  const active = users.filter((user) => user.status === "active").length;
  const lines = users.slice(0, 25).map((user) => {
    const badge = user.status === "active" ? "" : " · banned";
    return `<code>${esc(user.username)}</code> · ${user.role}${badge}\n   id ${shortId(user.id)} · last login ${ago(user.lastLoginAt)}`;
  });
  const keyboard: InlineButton[][] = users.slice(0, 20).map((user) => [
    {
      text: `${user.username}${user.status === "banned" ? " (banned)" : ""}`,
      callback_data: `u:info:${user.id}`,
    },
  ]);
  keyboard.push([
    { text: "Add user", callback_data: "u:new" },
    { text: "Menu", callback_data: "m:menu" },
  ]);
  return {
    text: card([
      `<b>Accounts</b> — ${users.length} total, ${active} active`,
      RULE,
      lines.join("\n"),
      users.length > 25 ? `…and ${users.length - 25} more` : "",
    ]),
    keyboard,
  };
}

export function userCard(user: UserRecord, stats: { chats: number; messages: number; lastActiveAt: string | null; projects: number }): string {
  return card([
    `<b>${esc(user.username)}</b>`,
    RULE,
    `role      ${user.role}`,
    `status    ${user.status}`,
    `id        <code>${esc(user.id)}</code>`,
    `created   ${when(user.createdAt)}`,
    `last login ${when(user.lastLoginAt)}`,
    RULE,
    `projects  ${stats.projects}`,
    `messages  ${stats.messages}`,
    `activity  ${ago(stats.lastActiveAt)}`,
  ]);
}

export function userKeyboard(user: UserRecord): InlineButton[][] {
  const rows: InlineButton[][] = [
    [
      user.status === "active"
        ? { text: "Ban", callback_data: `u:ban:${user.id}` }
        : { text: "Unban", callback_data: `u:unban:${user.id}` },
      { text: "Reset password", callback_data: `u:reset:${user.id}` },
    ],
    [
      user.role === "admin"
        ? { text: "Make user", callback_data: `u:role:${user.id}:user` }
        : { text: "Make admin", callback_data: `u:role:${user.id}:admin` },
      { text: "Rename", callback_data: `u:rename:${user.id}` },
    ],
    [
      { text: "Delete account", callback_data: `u:del:${user.id}` },
      { text: "All users", callback_data: "m:users" },
    ],
  ];
  return rows;
}

export async function keysList(): Promise<{ text: string; keyboard: InlineButton[][] }> {
  const keys = await listApiKeys();
  if (keys.length === 0) {
    return {
      text: card([
        "<b>No provider keys stored</b>",
        RULE,
        "The app is using the deployment environment variable, if one is set.",
        "Add a key with /addtoken to switch without redeploying.",
      ]),
      keyboard: [[{ text: "Add key", callback_data: "k:new" }]],
    };
  }
  const lines = keys.map((key) => {
    const mark = key.active ? " · ACTIVE" : "";
    return `<code>${esc(key.masked)}</code>${mark} · ${esc(key.label || "no label")}\n   ${key.status} · added ${when(key.addedAt)} · used ${ago(key.lastUsedAt)}`;
  });
  const keyboard: InlineButton[][] = keys.map((key) => [
    { text: `${key.active ? "● " : "○ "}${key.masked}`, callback_data: `k:info:${key.id}` },
  ]);
  keyboard.push([
    { text: "Add key", callback_data: "k:new" },
    { text: "Menu", callback_data: "m:menu" },
  ]);
  return { text: card([`<b>Provider keys</b> — ${keys.length} stored`, RULE, lines.join("\n")]), keyboard };
}

export function keyCard(key: { id: string; masked: string; label: string; provider: string; status: string; active: boolean; addedAt: string; addedBy: string; lastUsedAt: string | null; lastCheckedAt: string | null; lastCheckOk: boolean | null }): string {
  return card([
    `<b>${esc(key.masked)}</b>${key.active ? " · ACTIVE" : ""}`,
    RULE,
    `provider  ${esc(key.provider)}`,
    `label     ${esc(key.label || "no label")}`,
    `status    ${key.status}`,
    `added     ${when(key.addedAt)} by ${esc(key.addedBy)}`,
    `last used ${when(key.lastUsedAt)}`,
    `last test ${key.lastCheckedAt ? `${when(key.lastCheckedAt)} · ${key.lastCheckOk ? "ok" : "failed"}` : "never"}`,
    RULE,
    `id <code>${esc(key.id)}</code>`,
  ]);
}

export function keyKeyboard(key: { id: string; active: boolean; status: string }): InlineButton[][] {
  const rows: InlineButton[][] = [];
  const actions: InlineButton[] = [];
  if (!key.active && key.status === "active") actions.push({ text: "Activate", callback_data: `k:use:${key.id}` });
  actions.push({ text: "Test key", callback_data: `k:check:${key.id}` });
  rows.push(actions);
  rows.push([
    key.status === "active"
      ? { text: "Disable", callback_data: `k:off:${key.id}` }
      : { text: "Enable", callback_data: `k:on:${key.id}` },
    { text: "Delete", callback_data: `k:del:${key.id}` },
  ]);
  rows.push([{ text: "All keys", callback_data: "m:keys" }]);
  return rows;
}

export async function stats(): Promise<string> {
  const [counters, keys, settings, database, backup] = await Promise.all([
    systemCounters(),
    listApiKeys(),
    readSettings(),
    redisConfigured() ? redisPing() : Promise.resolve({ ok: false, latencyMs: 0 }),
    backupStatus().catch(() => ({ last: null, files: 0, configured: false, encryption: false })),
  ]);
  const users = await listUsers();
  const active = users.filter((user) => user.status === "active").length;
  const admins = users.filter((user) => user.role === "admin" && user.status === "active").length;
  const activeKey = keys.find((key) => key.active);
  return card([
    "<b>System stats</b>",
    RULE,
    `accounts  ${users.length} (${active} active, ${admins} admin)`,
    `projects  ${counters.projects}`,
    `messages  ${counters.messages}`,
    `keys      ${keys.length} · active ${activeKey ? esc(activeKey.masked) : "env fallback"}`,
    RULE,
    `database  ${database.ok ? `up · ${database.latencyMs} ms` : "DOWN"}`,
    `encryption ${encryptionReady() ? "ready" : "missing key"}`,
    `backup    ${backup.last ? `${ago(backup.last.createdAt)} · ${backup.files} file(s)` : "never"}`,
    `model     ${esc(settings.defaultModel || aiConfig.defaultModel)}`,
  ]);
}

export async function database(): Promise<string> {
  const ping = redisConfigured() ? await redisPing() : { ok: false, latencyMs: 0, error: "not configured" };
  const counters = redisConfigured() ? await systemCounters().catch(() => null) : null;
  const backup = await backupStatus().catch(() => null);
  return card([
    "<b>Database</b>",
    RULE,
    `transport  Upstash REST over HTTPS`,
    `status     ${ping.ok ? "connected" : "NOT CONNECTED"}`,
    `latency    ${ping.latencyMs} ms`,
    ping.error ? `error      ${esc(ping.error)}` : "",
    RULE,
    counters ? `users ${counters.users} · projects ${counters.projects} · keys ${counters.keys} · messages ${counters.messages}` : "counters unavailable",
    `encryption ${encryptionReady() ? "AES-256-GCM ready" : "AOMI_ENCRYPTION_KEY missing"}`,
    `backup repo ${backup?.configured ? "configured" : "missing"}`,
    RULE,
    ping.ok ? "Persistence is live: a restart does not lose any of the above." : "Actions are blocked until the database answers.",
  ]);
}

export async function backupScreen(): Promise<string> {
  const status = await backupStatus();
  return card([
    "<b>Backup</b>",
    RULE,
    status.last
      ? [
          `last      ${when(status.last.createdAt)} (${ago(status.last.createdAt)})`,
          `keys      ${status.last.keys}`,
          `size      ${(status.last.bytes / 1024).toFixed(1)} KB`,
          `checksum  <code>${esc(status.last.sha256.slice(0, 16))}…</code>`,
          `by        ${esc(status.last.actor)}`,
          `files     ${status.files} kept in the private repo`,
        ].join("\n")
      : "No backup has been taken yet.",
    RULE,
    `encryption ${status.encryption ? "AES-256-GCM" : "missing key"}`,
    `repo       ${status.configured ? "private aomi-config" : "not configured"}`,
    RULE,
    "Snapshots are encrypted before they leave the database.",
  ]);
}

export const backupKeyboard = (): InlineButton[][] => [
  [
    { text: "Back up now", callback_data: "b:now" },
    { text: "Verify files", callback_data: "b:list" },
  ],
  [{ text: "Menu", callback_data: "m:menu" }],
];

export async function auditScreen(): Promise<string> {
  const entries = await listAudit(12);
  if (entries.length === 0) return "<b>Audit log</b>\nNothing recorded yet.";
  const lines = entries.map((entry) => {
    const target = entry.target ? ` → ${esc(entry.target)}` : "";
    return `${when(entry.at)} · ${esc(entry.actorType)}/${esc(entry.actorId.slice(0, 10))} · <b>${esc(entry.action)}</b>${target}`;
  });
  return card(["<b>Audit log</b> — latest 12", RULE, lines.join("\n")]);
}

export async function userStatsScreen(userId: string): Promise<string | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  const stats = await userStats(userId);
  return card([
    `<b>${esc(user.username)}</b> — activity`,
    RULE,
    `projects  ${stats.projects}`,
    `messages  ${stats.messages}`,
    `last seen ${when(stats.lastActiveAt)}`,
    `status    ${user.status}`,
    RULE,
    "Conversation history is available in the web panel under Admin → Users.",
  ]);
}
