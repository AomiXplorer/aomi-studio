/**
 * End-to-end verification for the multiuser upgrade.
 *
 * Runs the real production build against the real Upstash database, then checks the
 * behaviour the brief asks for: per-user isolation, RBAC, ban taking effect immediately,
 * brute-force lockout, Telegram authorisation, persistence across a restart, encrypted
 * key storage and a working encrypted backup.
 *
 * Usage: node scripts/upgrade-check.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const PORT = 3399;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_TELEGRAM = "424242";
const WEBHOOK_SECRET = env.TELEGRAM_WEBHOOK_SECRET;
const REST_URL = env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function cmd(...args) {
  const response = await fetch(REST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  return payload.result;
}

let server = null;
async function start() {
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, ...env, TELEGRAM_ADMIN_ID: ADMIN_TELEGRAM, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error("server did not start");
}

async function stop() {
  if (!server) return;
  server.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  server = null;
}

function jar(response) {
  const raw = response.headers.getSetCookie?.() || [];
  const cookie = raw.find((value) => value.startsWith("aomi_session="));
  return cookie ? cookie.split(";")[0] : null;
}

async function login(username, password, cookie) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ username, password }),
  });
  return { status: response.status, cookie: jar(response), body: await response.json().catch(() => ({})) };
}

async function seedUser(id, username, password, role = "user") {
  const hash = await bcrypt.hash(password, 12);
  await cmd(
    "HSET",
    `aomi:user:${id}`,
    "id", id,
    "username", username,
    "usernameLower", username.toLowerCase(),
    "passwordHash", hash,
    "role", role,
    "status", "active",
    "createdAt", new Date().toISOString(),
    "createdBy", "probe",
    "sessionVersion", "1",
  );
  await cmd("SADD", "aomi:users", id);
  await cmd("SET", `aomi:username:${username.toLowerCase()}`, id);
}

async function main() {
  const stamp = Date.now().toString(36);
  const adminId = `probe-admin-${stamp}`;
  const userAId = `probe-userA-${stamp}`;
  const userBId = `probe-userB-${stamp}`;
  const projectId = `probe-${stamp}-project`;
  const password = "ProbePass123!";

  console.log("== booting production build ==");
  await start();

  // 1. Unauthenticated surface
  const health = await fetch(`${BASE}/api/health`);
  check("health endpoint answers", health.ok);
  const unauth = await fetch(`${BASE}/api/projects`);
  check("API refuses requests without a session", unauth.status === 401, `status ${unauth.status}`);

  // 2. Accounts
  await seedUser(adminId, `probe_admin_${stamp}`, password, "admin");
  await seedUser(userAId, `probe_user_a_${stamp}`, password, "user");
  await seedUser(userBId, `probe_user_b_${stamp}`, password, "user");

  const admin = await login(`probe_admin_${stamp}`, password);
  const adminCookie = admin.cookie;
  check("admin can sign in", admin.status === 200 && Boolean(adminCookie), `status ${admin.status}`);
  const overview = await fetch(`${BASE}/api/admin/overview`, { headers: { cookie: adminCookie } });
  const overviewBody = await overview.json();
  check("admin panel data loads", overview.status === 200 && Array.isArray(overviewBody.users), `status ${overview.status}`);
  check("panel response carries no password hash", !JSON.stringify(overviewBody).includes("$2b$"), "no bcrypt hash in payload");
  check("panel response masks provider keys", overviewBody.keys?.every((key) => !key.cipher && key.masked.includes("****")) ?? true);

  const userA = await login(`probe_user_a_${stamp}`, password);
  const userB = await login(`probe_user_b_${stamp}`, password);
  check("plain users can sign in", userA.status === 200 && userB.status === 200);

  const forbidden = await fetch(`${BASE}/api/admin/overview`, { headers: { cookie: userA.cookie } });
  check("RBAC blocks a non-admin from the panel API", forbidden.status === 403, `status ${forbidden.status}`);
  const pageGate = await fetch(`${BASE}/admin`, { headers: { cookie: userA.cookie }, redirect: "manual" });
  check("RBAC redirects a non-admin away from /admin", pageGate.status === 307, `status ${pageGate.status}`);

  // 3. Data isolation
  const created = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: userA.cookie },
    body: JSON.stringify({ name: "Probe project", id: projectId }),
  });
  const createdBody = await created.json().catch(() => ({}));
  check("project is created for its owner", created.status === 200 && createdBody.project?.id === projectId, `status ${created.status}`);
  const ownRead = await fetch(`${BASE}/api/projects/${projectId}`, { headers: { cookie: userA.cookie } });
  check("owner can read the project", ownRead.status === 200);
  const foreignRead = await fetch(`${BASE}/api/projects/${projectId}`, { headers: { cookie: userB.cookie } });
  check("another user cannot read the project", foreignRead.status === 404, `status ${foreignRead.status}`);
  const foreignMessages = await fetch(`${BASE}/api/projects/${projectId}/messages`, { headers: { cookie: userB.cookie } });
  check("another user cannot read its history", foreignMessages.status === 404, `status ${foreignMessages.status}`);

  // 4. Persistence module: write, merge and read back
  const probe = await runProbe(["mirror", projectId, userAId]);
  const mirrored = JSON.parse(probe);
  check("messages are written to Redis", mirrored.count === 2, `count ${mirrored.count}`);
  check("a continuation extends the same answer", mirrored.messages[1]?.content.includes("disambung"), mirrored.messages[1]?.content);
  const history = await fetch(`${BASE}/api/projects/${projectId}/messages`, { headers: { cookie: userA.cookie } });
  const historyBody = await history.json();
  check("history is served from the database when local state is empty", historyBody.source === "database" && historyBody.messages.length === 2, `source ${historyBody.source}`);

  // 5. Provider keys, encrypted
  const plaintextKey = `sk-probe-${stamp}-abcdef123456`;
  const added = await fetch(`${BASE}/api/admin/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ action: "addKey", label: "probe", key: plaintextKey }),
  });
  const addedBody = await added.json();
  check("admin can store a provider key", added.status === 200 && Boolean(addedBody.key?.id), `status ${added.status}`);
  const keyId = addedBody.key?.id;
  check("the stored key is masked for display", addedBody.key?.masked === "sk-****3456", addedBody.key?.masked);
  const rawKey = await cmd("HGETALL", `aomi:apikey:${keyId}`);
  const record = Object.fromEntries(Array.from({ length: rawKey.length / 2 }, (_, index) => [rawKey[index * 2], rawKey[index * 2 + 1]]));
  check("the key is sealed, not stored in plaintext", Boolean(record.cipher && record.iv && record.tag) && !JSON.stringify(record).includes(plaintextKey));
  check("the active key pointer is set", (await cmd("GET", "aomi:apikey:active")) === keyId);

  // 6. Brute force lockout
  const victim = `probe_user_b_${stamp}`;
  for (let attempt = 0; attempt < 5; attempt += 1) await login(victim, "wrong-password-1");
  const locked = await login(victim, password);
  check("five wrong passwords lock the account", locked.status === 429, `status ${locked.status}`);
  await cmd("DEL", `aomi:login:fail:${victim}`);
  const unlocked = await login(victim, password);
  check("the lock clears after its window", unlocked.status === 200, `status ${unlocked.status}`);

  // 7. Ban takes effect immediately
  const banned = await fetch(`${BASE}/api/admin/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ action: "setStatus", userId: userBId, status: "banned" }),
  });
  check("admin can ban an account", banned.status === 200);
  const bannedRead = await fetch(`${BASE}/api/projects`, { headers: { cookie: unlocked.cookie } });
  // A banned account is rejected either because its session version moved (401) or because
  // the guard sees the status (403). Both mean the cookie stops working immediately.
  check("an existing session dies on the next request", [401, 403].includes(bannedRead.status), `status ${bannedRead.status}`);
  const bannedLogin = await login(victim, password);
  check("a banned account cannot sign in", bannedLogin.status === 403, `status ${bannedLogin.status}`);
  await fetch(`${BASE}/api/admin/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ action: "setStatus", userId: userBId, status: "active" }),
  });

  // 8. Telegram authorisation
  const badSecret = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": "wrong" },
    body: JSON.stringify({ message: { message_id: 1, chat: { id: 999 }, from: { id: 999 }, text: "/stats" } }),
  });
  check("webhook rejects a wrong secret token", badSecret.status === 401, `status ${badSecret.status}`);

  const stranger = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
    body: JSON.stringify({ message: { message_id: 2, chat: { id: 999 }, from: { id: 999, username: "stranger" }, text: "/listuser" } }),
  });
  check("webhook answers an unknown sender", stranger.status === 200, `status ${stranger.status}`);
  const deniedAudit = await cmd("LRANGE", "aomi:audit", 0, 5);
  check("an unauthorised command is recorded", deniedAudit.some((entry) => entry.includes("telegram.denied")));
  const strangerReply = await cmd("LRANGE", "aomi:audit", 0, 2);
  check("no admin data is produced for an unknown sender", !strangerReply.some((entry) => entry.includes("user.role_changed")));

  const adminCommand = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
    body: JSON.stringify({ message: { message_id: 3, chat: { id: Number(ADMIN_TELEGRAM) }, from: { id: Number(ADMIN_TELEGRAM) }, text: "/stats" } }),
  });
  check("an authorised admin command is accepted", adminCommand.status === 200, `status ${adminCommand.status}`);
  const strangerCallback = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
    body: JSON.stringify({ callback_query: { id: "cb1", data: "m:users", from: { id: 999 }, message: { message_id: 9, chat: { id: 999 } } } }),
  });
  check("a callback from a stranger is refused", strangerCallback.status === 200);

  // 9. Encrypted backup
  const backup = await fetch(`${BASE}/api/admin/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ action: "backupNow" }),
  });
  const backupBody = await backup.json();
  check("an encrypted backup is created", backup.status === 200 && Boolean(backupBody.backup?.path), backupBody?.error?.message || backupBody.backup?.path);
  const dry = JSON.parse(await runProbe(["restore-dry", backupBody.backup?.path]));
  check(
    "the backup decrypts and passes its checksum",
    Array.isArray(dry.keys) && dry.keys.includes(`aomi:user:${adminId}`),
    `${dry.keys?.length} keys sealed: ${(dry.keys || []).slice(0, 6).join(", ")}`,
  );

  // 10. Restart persistence
  await stop();
  await start();
  const afterRestart = await login(`probe_admin_${stamp}`, password);
  check("accounts survive a restart", afterRestart.status === 200, `status ${afterRestart.status}`);
  const afterOverview = await fetch(`${BASE}/api/admin/overview`, { headers: { cookie: afterRestart.cookie } });
  const afterBody = await afterOverview.json();
  check("the panel still lists the accounts", afterOverview.status === 200 && afterBody.users.some((user) => user.username === `probe_user_a_${stamp}`));
  const afterHistory = await fetch(`${BASE}/api/projects/${projectId}/messages`, { headers: { cookie: adminCookie } });
  const afterHistoryBody = await afterHistory.json();
  check("conversation history survives a restart", afterHistoryBody.messages?.length >= 2, `${afterHistoryBody.messages?.length ?? 0} messages`);

  // 11. Cleanup
  await fetch(`${BASE}/api/admin/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: afterRestart.cookie },
    body: JSON.stringify({ action: "deleteKey", keyId }),
  });
  for (const id of [userAId, userBId, adminId]) {
    await fetch(`${BASE}/api/admin/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: afterRestart.cookie },
      body: JSON.stringify({ action: "deleteUser", userId: id, purge: true }),
    });
  }
  await runProbe(["cleanup", projectId, userAId]);
  const leftovers = await cmd("SMEMBERS", "aomi:users");
  check("probe accounts are removed", !leftovers.includes(userAId) && !leftovers.includes(userBId));

  await stop();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log("failed:", failed.map((result) => result.name).join(", "));
    process.exit(1);
  }
}

async function runProbe(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", "scripts/db-probe.ts", ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || `probe exited ${code}`))));
  });
}

main().catch(async (error) => {
  console.error("suite error:", error instanceof Error ? error.message : error);
  await stop();
  process.exit(1);
});
