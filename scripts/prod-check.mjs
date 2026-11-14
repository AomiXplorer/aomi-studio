import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("/app/conversations/6af74bd214941bf8d3f15a90/aomi-app/.env.local", "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const BASE = "https://vierraapi.my.id";
const cmd = async (...a) => {
  const r = await fetch(env.UPSTASH_REDIS_REST_URL, { method: "POST", headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }, body: JSON.stringify(a) });
  return (await r.json()).result;
};
const out = [];
const check = (name, ok, detail = "") => { out.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); };

const id = "prod-verify-" + Date.now().toString(36);
const password = "ProdVerify123!";
const hash = await bcrypt.hash(password, 12);
await cmd("HSET", `aomi:user:${id}`, "id", id, "username", "prod_verify", "usernameLower", "prod_verify", "passwordHash", hash, "role", "admin", "status", "active", "createdAt", new Date().toISOString(), "createdBy", "prod-check", "sessionVersion", "1");
await cmd("SADD", "aomi:users", id);
await cmd("SET", "aomi:username:prod_verify", id);

const health = await fetch(`${BASE}/api/health`);
check("production health", health.ok, `status ${health.status}`);

const unauth = await fetch(`${BASE}/api/admin/overview`);
check("panel refuses anonymous callers", unauth.status === 401, `status ${unauth.status}`);

const login = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "prod_verify", password }) });
const cookie = (login.headers.getSetCookie() || []).find((c) => c.startsWith("aomi_session="))?.split(";")[0];
check("production reads accounts from Redis", login.status === 200 && Boolean(cookie), `status ${login.status}`);

const overview = await fetch(`${BASE}/api/admin/overview`, { headers: { cookie } });
const body = await overview.json();
check("panel loads on production", overview.status === 200 && Array.isArray(body.users), `status ${overview.status}`);
check("database reports connected", body.database?.ok === true, `${body.database?.latencyMs} ms`);
check("encryption key present on production", body.database?.encryption === true);
check("owner account is reachable", (body.users || []).some((u) => u.username === "Aomixplorer"), `${(body.users || []).length} accounts`);

const plaintext = "sk-prodcheck-" + Date.now().toString(36) + "-abcdef";
const added = await fetch(`${BASE}/api/admin/action`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ action: "addKey", label: "prod check", key: plaintext }) });
const addedBody = await added.json();
check("a provider key can be sealed on production", added.status === 200 && Boolean(addedBody.key?.id), `status ${added.status}`);
check("the sealed key comes back masked", String(addedBody.key?.masked || "").includes("****"), addedBody.key?.masked);
const raw = await cmd("HGETALL", `aomi:apikey:${addedBody.key?.id}`);
check("no plaintext key is stored", !JSON.stringify(raw).includes(plaintext));

const del = await fetch(`${BASE}/api/admin/action`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ action: "deleteKey", keyId: addedBody.key?.id }) });
check("the test key is removed", del.status === 200);

const banned = await fetch(`${BASE}/api/admin/action`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ action: "setStatus", userId: id, status: "banned" }) });
check("admin action writes through RBAC", banned.status === 200);
const afterBan = await fetch(`${BASE}/api/admin/overview`, { headers: { cookie } });
check("a banned session stops working", [401, 403].includes(afterBan.status), `status ${afterBan.status}`);

// cleanup
await cmd("DEL", `aomi:user:${id}`);
await cmd("SREM", "aomi:users", id);
await cmd("DEL", "aomi:username:prod_verify");
const loginPage = await fetch(`${BASE}/login`);
check("login page renders", loginPage.status === 200);
console.log(`\n${out.filter(Boolean).length}/${out.length} production checks passed`);
process.exit(out.every(Boolean) ? 0 : 1);
