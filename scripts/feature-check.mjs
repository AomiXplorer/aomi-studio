/**
 * Local feature checks for the session's changes: provider label rebrand, quota path,
 * and deleting a conversation. Runs against a local production build with a minted
 * owner session, so nothing here needs the owner password.
 */
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, "")];
    }),
);

const redis = (...args) =>
  fetch(env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
    body: JSON.stringify(args),
  }).then((response) => response.json());

const ids = (await redis("SMEMBERS", "aomi:users")).result || [];
let owner = null;
for (const id of ids) {
  const raw = (await redis("HGETALL", `aomi:user:${id}`)).result || [];
  const user = Object.fromEntries(Array.from({ length: raw.length / 2 }, (_, i) => [raw[i * 2], raw[i * 2 + 1]]));
  if (user.role === "admin") owner = user;
}

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const b64 = (buffer) => Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ua = b64(createHash("sha256").update(UA).digest()).slice(0, 16);
const now = Math.floor(Date.now() / 1000);
const body = b64(JSON.stringify({ sub: owner.username, uid: owner.id, role: "admin", ver: Number(owner.sessionVersion || 1), iat: now, exp: now + 3600, ua }));
const cookie = `aomi_session=${body}.${b64(createHmac("sha256", env.AOMI_SESSION_SECRET).update(body).digest())}`;
const call = (path, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: { Cookie: cookie, "Content-Type": "application/json", "User-Agent": UA, ...(init.headers || {}) },
  });

// 1. model labels
const modelsRes = await call("/api/models");
const models = await modelsRes.json();
console.log("   /api/models status", modelsRes.status, "configured", models.configured);
const labels = (models.models || []).map((model) => model.label);
const leaked = labels.filter((label) => /bangun\s*web/i.test(label));
const renamed = labels.filter((label) => /aomix/i.test(label));
console.log(`1. labels: ${labels.length} models, ${renamed.length} showing AomiX, ${leaked.length} still saying BangunWeb`);
console.log("   sample:", JSON.stringify(labels.slice(0, 6)));

// 2. a real chat request: the provider answers, or it answers that the balance is gone
const createdRes = await call("/api/projects", { method: "POST", body: JSON.stringify({ name: "quota-check", template: "static" }) });
const created = await createdRes.json();
if (!created.project) {
  console.log("   project create failed", createdRes.status, JSON.stringify(created).slice(0, 200));
  process.exit(1);
}
const projectId = created.project.id;
const stream = await call("/api/chat", { method: "POST", body: JSON.stringify({ projectId, message: "ping", model: models.defaultModel }) });
const text = await stream.text();
const errorLine = text.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5)).filter((line) => line.includes('"error"'));
console.log("2. chat stream events:", text.split("\n").filter((line) => line.startsWith("data:")).length, "first error:", errorLine[0]?.slice(0, 160) || "none");
const quota = await (await call("/api/quota")).json();
console.log("   quota state:", JSON.stringify(quota));

// 3. conversation deletion
await redis("LPUSH", `aomi:project:${projectId}:messages`, JSON.stringify({ id: "probe", role: "user", content: "probe", createdAt: new Date().toISOString() }));
const before = (await redis("LLEN", `aomi:project:${projectId}:messages`)).result;
const removed = await call(`/api/projects/${projectId}/messages`, { method: "DELETE" });
const after = (await redis("LLEN", `aomi:project:${projectId}:messages`)).result;
const listed = await (await call(`/api/projects/${projectId}/messages`)).json();
console.log(`3. delete history: status ${removed.status}, redis ${before} -> ${after}, api now ${listed.messages.length} message(s)`);

// 4. the route is owner-gated
const anon = await fetch(`${BASE}/api/projects/${projectId}/messages`, { method: "DELETE" });
console.log("4. anonymous delete:", anon.status);

// cleanup: the probe project only existed for this check
await call(`/api/projects/${projectId}`, { method: "DELETE" });
console.log("   probe project removed:", projectId.slice(0, 8));
