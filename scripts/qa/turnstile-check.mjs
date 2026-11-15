#!/usr/bin/env node
/**
 * The sign-in challenge, checked against a running server that has the secret set.
 *
 * The browser side of Turnstile cannot be solved from a script, so these checks are the
 * part that actually decides whether a bot gets in: no token, a token Cloudflare rejects,
 * a token it accepts, and that a passing challenge still leaves the password check doing
 * its job. Run `scripts/qa/mock-turnstile.mjs` first.
 *
 *   BASE=http://127.0.0.1:3106 TURNSTILE_GOOD_TOKEN=... node scripts/qa/turnstile-check.mjs
 */
const BASE = process.env.BASE || "http://127.0.0.1:3106";
const OWNER_USER = process.env.OWNER_USER || "owner";
const OWNER_PASS = process.env.OWNER_PASS || "owner-qa-password-123";
const GOOD_TOKEN = process.env.TURNSTILE_GOOD_TOKEN || "qa-turnstile-good-token";

let failures = 0;
function check(name, condition, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : ` — ${detail}`}`);
}

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const json = await response.json().catch(() => null);
  const cookie = (response.headers.getSetCookie ? response.headers.getSetCookie() : [])
    .map((line) => line.split(";")[0])
    .join("; ");
  return { status: response.status, json, cookie };
}

const login = (extra) => post("/api/auth/login", { username: OWNER_USER, password: OWNER_PASS, ...extra });

// 1. no token at all: refused before the password is even looked at
const missing = await login({});
check(
  "1. token kosong ditolak 400",
  missing.status === 400 && /verification/i.test(missing.json?.error?.message || ""),
  `status ${missing.status}`,
);
check("1b. tidak ada cookie sesi dari percobaan tanpa token", !/aomi_session=/.test(missing.cookie), missing.cookie);

// 2. a token the provider does not recognise: refused, still no session
const wrong = await login({ turnstileToken: "definitely-not-a-token" });
check("2. token palsu ditolak 403", wrong.status === 403, `status ${wrong.status}`);
check("2b. token palsu tidak membuat sesi", !/aomi_session=/.test(wrong.cookie), wrong.cookie);

// 3. a challenge that passes: the password is then checked as usual
const good = await login({ turnstileToken: GOOD_TOKEN });
check("3. token valid + password benar masuk", good.status === 200, `status ${good.status} ${JSON.stringify(good.json)}`);
check("3b. cookie sesi diberikan", /aomi_session=/.test(good.cookie), good.cookie);

// 4. passing the challenge is not the same as knowing the password
const badPass = await post("/api/auth/login", {
  username: OWNER_USER,
  password: "wrong-password-123",
  turnstileToken: GOOD_TOKEN,
});
check(
  "4. token valid + password salah tetap ditolak",
  badPass.status === 401 || badPass.status === 429,
  `status ${badPass.status}`,
);
check("4b. tidak ada sesi dari password salah", !/aomi_session=/.test(badPass.cookie), badPass.cookie);

console.log(failures === 0 ? "\nturnstile: all checks passed" : `\nturnstile: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
