// Proves the "credentials in a private GitHub repo" path works, without ever touching a
// real repo: global fetch is stubbed, so the loader's HTTP contract, its fallbacks and its
// cache are exercised for real while nothing secret leaves this machine.
//
//   node --experimental-strip-types scripts/config-source-check.mjs
import { readFileSync } from "node:fs";

const realConfig = readFileSync("/tmp/aomi-auth.json", "utf8");

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
};

let calls = [];
let handler = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), headers: init.headers || {} });
  return handler(String(url), init);
};

const json = (body, status = 200, headers = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

// Fresh module instance per scenario so the cache never leaks between cases.
let counter = 0;
async function loader(env) {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("AOMI_")) delete process.env[key];
  }
  Object.assign(process.env, env);
  calls = [];
  const mod = await import(`../src/lib/auth/config.ts?v=${counter++}`);
  return mod.loadAuthConfig;
}

// 1. Missing token: the repo is never called.
{
  const load = await loader({ AOMI_CONFIG_REPO: "Aomixplorer/aomi-config", AOMI_AUTH_JSON: realConfig });
  const state = await load();
  check("no token skips the private repo entirely", calls.length === 0 && state.source === "env", state.source);
}

// 2. Read-only token + private repo returns the file.
{
  const load = await loader({
    AOMI_CONFIG_REPO: "Aomixplorer/aomi-config",
    AOMI_CONFIG_TOKEN: "ghp_readonly_stub",
    AOMI_AUTH_JSON: realConfig,
  });
  handler = async () => json(realConfig, 200, { etag: 'W/"abc123"' });
  const state = await load();
  const auth = calls[0] || {};
  check("private repo file wins over the env copy", state.source === "private-repo", state.source);
  check("owner account parses from the repo file", state.config?.users?.[0]?.username === "Aomixplorer");
  check(
    "request is scoped to api.github.com with a bearer token",
    String(auth.url).includes("/repos/Aomixplorer/aomi-config/contents/auth.json") &&
      String(auth.headers.Authorization).startsWith("Bearer "),
    String(auth.url).replace("https://api.github.com", ""),
  );
  check("hash-only config carries a scrypt hash, not a password", Boolean(state.config?.users?.[0]?.scrypt?.key) && !("password" in (state.config?.users?.[0] || {})));
}

// 3. Second read inside the TTL is served from memory, not the network.
{
  const load = await loader({ AOMI_CONFIG_REPO: "Aomixplorer/aomi-config", AOMI_CONFIG_TOKEN: "t" });
  handler = async () => json(realConfig, 200, { etag: 'W/"etag-1"' });
  await load();
  const before = calls.length;
  await load();
  check("cached read makes no second request", calls.length === before, `${calls.length} calls`);
}

// 4. Revalidation: ETag is sent back and a 304 keeps the cached config.
{
  const load = await loader({ AOMI_CONFIG_REPO: "Aomixplorer/aomi-config", AOMI_CONFIG_TOKEN: "t" });
  handler = async () => json(realConfig, 200, { etag: 'W/"etag-2"' });
  await load();
  handler = async () => json("", 304);
  const state = await load({ force: true });
  const revalidate = calls[calls.length - 1];
  check("revalidation sends If-None-Match", revalidate?.headers?.["If-None-Match"] === 'W/"etag-2"', String(revalidate?.headers?.["If-None-Match"]));
  check("a 304 keeps the owner signed in", state.source === "private-repo" && Boolean(state.config));
}

// 5. Repo failure falls back to the env copy instead of locking the owner out.
{
  const load = await loader({ AOMI_CONFIG_REPO: "Aomixplorer/aomi-config", AOMI_CONFIG_TOKEN: "t", AOMI_AUTH_JSON: realConfig });
  handler = async () => json({ message: "Not Found" }, 404);
  const state = await load();
  check("404 on the repo falls back to env", state.source === "env" && Boolean(state.config), state.reason || "");
}

// 6. Repo failure with no env copy: the last good config keeps serving.
{
  const load = await loader({ AOMI_CONFIG_REPO: "Aomixplorer/aomi-config", AOMI_CONFIG_TOKEN: "t" });
  handler = async () => json(realConfig, 200);
  await load();
  handler = async () => json({ message: "boom" }, 500);
  const state = await load({ force: true });
  check("provider outage keeps the cached owner config", Boolean(state.config) && Boolean(state.reason), state.reason || "");
}

// 7. A corrupted repo file is rejected, not half-accepted.
{
  const load = await loader({ AOMI_CONFIG_REPO: "Aomixplorer/aomi-config", AOMI_CONFIG_TOKEN: "t", AOMI_AUTH_JSON: realConfig });
  handler = async () => json('{"version":1,"users":[]}');
  const state = await load();
  check("an empty user list in the repo is refused", state.source === "env", state.source);
}

// 8. Nothing configured at all is an explicit, non-throwing state.
{
  const load = await loader({});
  const state = await load();
  check("unconfigured install reports its reason", state.source === "none" && Boolean(state.reason));
}

globalThis.fetch = realFetch;
const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
console.log(failures.length ? "OVERALL FAIL" : "OVERALL PASS");
process.exit(failures.length ? 1 : 0);
