// Security regression suite for the login gate: every assertion below hits a real
// server, so a passing run means the protection is actually wired, not described.
//
//   AOMI_OWNER_PASSWORD="…" node scripts/auth-check.mjs http://127.0.0.1:3130 "$AOMI_OWNER_PASSWORD"
//
// The password argument is only used to prove a correct login works and that it never
// reaches a client bundle. Nothing is written to disk.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://127.0.0.1:3130";
// The password is passed in at run time and never written into this file.
const PASSWORD = process.argv[3] || process.env.AOMI_OWNER_PASSWORD;
const OWNER = process.argv[4] || "Aomixplorer";
if (!PASSWORD) {
  console.error("usage: node scripts/auth-check.mjs <base> <owner-password> [username]");
  process.exit(1);
}

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
};

const ip = (n) => ({ "x-forwarded-for": `203.0.113.${n}` });

async function login(body, headers = {}) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return { status: response.status, headers: response.headers, cookie: response.headers.get("set-cookie"), payload };
}

// 1. Protected pages and APIs refuse an anonymous caller.
const pageRedirect = await fetch(`${BASE}/chat`, { redirect: "manual" });
check(
  "anonymous page request redirects to login",
  pageRedirect.status === 307 && (pageRedirect.headers.get("location") || "").includes("/login"),
  `${pageRedirect.status} -> ${pageRedirect.headers.get("location")}`,
);

const apiRoutes = ["/api/projects", "/api/models", "/api/chat", "/api/image", "/api/audio", "/api/upload", "/api/scaffold", "/api/providers/status"];
const apiStatuses = [];
for (const route of apiRoutes) {
  const response = await fetch(`${BASE}${route}`, { method: route === "/api/projects" ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: route === "/api/projects" ? undefined : "{}" });
  apiStatuses.push(`${route}:${response.status}`);
}
check("every API route answers 401 without a session", apiStatuses.every((entry) => entry.endsWith(":401")), apiStatuses.join(" "));

// 2. Login screen is public and carries the hardening headers.
const loginPage = await fetch(`${BASE}/login`);
const loginHtml = await loginPage.text();
const csp = loginPage.headers.get("content-security-policy") || "";
const nonceMatch = csp.match(/'nonce-([a-f0-9]+)'/);
check("login page is reachable", loginPage.status === 200, String(loginPage.status));
check("CSP present with a nonce", Boolean(nonceMatch), csp.slice(0, 80) + "…");
check("inline script carries the same nonce", Boolean(nonceMatch) && loginHtml.includes(`nonce="${nonceMatch[1]}"`));
check("framing and sniffing blocked", loginPage.headers.get("x-frame-options") === "DENY" && loginPage.headers.get("x-content-type-options") === "nosniff");
check("no credential material in the login HTML", !loginHtml.includes(PASSWORD) && !/scrypt/i.test(loginHtml));

// 3. Wrong credentials give one identical answer and never set a cookie.
const wrongUser = await login({ username: "not-a-user", password: PASSWORD }, ip(11));
const wrongPass = await login({ username: OWNER, password: "definitely-wrong" }, ip(12));
check(
  "unknown user and wrong password are indistinguishable",
  wrongUser.status === 401 && wrongPass.status === 401 && wrongUser.payload?.error?.message === wrongPass.payload?.error?.message,
  `${wrongUser.status}/${wrongPass.status} "${wrongPass.payload?.error?.message}"`,
);
check("failed logins set no cookie", !wrongUser.cookie && !wrongPass.cookie);

// 4. A cross-site origin cannot drive the login endpoint.
const crossSite = await login({ username: OWNER, password: PASSWORD }, { ...ip(13), Origin: "https://evil.example" });
check("cross-origin login is refused", crossSite.status === 403, String(crossSite.status));

// 5. Correct credentials work and the cookie is hardened.
const good = await login({ username: OWNER, password: PASSWORD }, ip(14));
const setCookie = good.cookie || "";
check("owner can sign in", good.status === 200, String(good.status));
check("cookie is HttpOnly", /HttpOnly/i.test(setCookie));
check("cookie is SameSite=Lax", /SameSite=Lax/i.test(setCookie));
check("cookie is scoped to /", /Path=\//.test(setCookie));
const cookieValue = (setCookie.match(/aomi_session=([^;]+)/) || [])[1] || "";

// 6. Tampering with the signed token fails closed.
const flipTail = cookieValue.slice(0, -1) + (cookieValue.endsWith("A") ? "B" : "A");
const tampered = await fetch(`${BASE}/api/projects`, { headers: { cookie: `aomi_session=${flipTail}` } });
check("tampered cookie is rejected", tampered.status === 401, String(tampered.status));

const unsigned = await fetch(`${BASE}/api/projects`, { headers: { cookie: `aomi_session=${Buffer.from('{"sub":"Aomixplorer","role":"owner","exp":9999999999}').toString("base64url")}.x` } });
check("hand-made cookie is rejected", unsigned.status === 401, String(unsigned.status));

const authorized = await fetch(`${BASE}/api/projects`, { headers: { cookie: `aomi_session=${cookieValue}` } });
check("valid cookie opens the API", authorized.status === 200, String(authorized.status));

const sessionInfo = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: `aomi_session=${cookieValue}` } });
const sessionPayload = await sessionInfo.json().catch(() => null);
check("session endpoint reports the signed-in owner", sessionInfo.status === 200 && sessionPayload?.user?.username === OWNER);

// 7. Logout actually ends the session server-side contract.
const logout = await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: { cookie: `aomi_session=${cookieValue}` } });
const cleared = /aomi_session=;/.test(logout.headers.get("set-cookie") || "") && /Max-Age=0/i.test(logout.headers.get("set-cookie") || "");
const afterLogout = await fetch(`${BASE}/api/projects`, { headers: { cookie: "aomi_session=" } });
check("logout clears the cookie and the API stays closed", logout.status === 200 && cleared && afterLogout.status === 401, `cleared=${cleared}`);

// 8. Nothing secret ships to the browser.
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}
const staticFiles = await walk(".next/static");
let passwordLeak = null;
let secretLeak = null;
const secret = process.env.AOMI_SESSION_SECRET || "";
for (const file of staticFiles) {
  if (!/\.(js|json|css)$/.test(file)) continue;
  const body = await readFile(file, "utf8");
  if (body.includes(PASSWORD)) passwordLeak = file;
  if (secret && body.includes(secret)) secretLeak = file;
}
check("owner password is absent from every client bundle", !passwordLeak, passwordLeak ? `found in ${passwordLeak}` : `${staticFiles.length} files scanned`);
check("session secret is absent from every client bundle", !secretLeak, secretLeak ? `found in ${secretLeak}` : "");

// 9. Browser flow: the form logs in, redirects, and a fresh visit stays signed in.
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"], protocolTimeout: 180000 });
const page = await browser.newPage();
const consoleErrors = [];
page.on("pageerror", (error) => consoleErrors.push(String(error).slice(0, 120)));
await page.goto(`${BASE}/projects`, { waitUntil: "networkidle2" });
check("browser lands on the login screen", page.url().includes("/login"), page.url().replace(BASE, ""));

await page.type("#username", "wrong-name");
await page.type("#password", "nope");
await page.click('button[type="submit"]');
await page.waitForFunction(() => Boolean(document.querySelector("#login-error")), { timeout: 15000 });
const errorText = await page.$eval("#login-error", (el) => el.textContent?.trim() || "");
check("a rejected login shows the server's message", errorText.includes("Incorrect"), errorText.slice(0, 60));

await page.evaluate(() => {
  document.querySelector("#username").value = "";
  document.querySelector("#password").value = "";
});
await page.type("#username", OWNER);
await page.type("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 20000 });
check("form login returns to the page that was asked for", page.url().includes("/projects"), page.url().replace(BASE, ""));

const cookies = await page.cookies();
const sessionCookie = cookies.find((cookie) => cookie.name === "aomi_session");
check("session cookie is not readable by scripts", Boolean(sessionCookie?.httpOnly));
const storage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
check("no token is parked in web storage", !storage.local.includes("aomi_session") && !storage.session.includes("aomi_session"));

await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
check("signed-in visit to /chat stays signed in", !page.url().includes("/login"), page.url().replace(BASE, ""));
check("chat renders for the owner", await page.evaluate(() => Boolean(document.querySelector("#aomi-composer"))));

// 10. Signed-in owners do not see the login screen again.
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
check("a signed-in visitor is sent away from /login", !page.url().includes("/login"), page.url().replace(BASE, ""));

// 11. Open redirect attempt is neutralised.
await page.evaluate(async () => {
  await fetch("/api/auth/logout", { method: "POST" });
});
await page.goto(`${BASE}/login?next=https://evil.example/steal`, { waitUntil: "networkidle2" });
await page.type("#username", OWNER);
await page.type("#password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 20000 });
check("external next param cannot redirect off-site", new URL(page.url()).host === new URL(BASE).host, page.url().replace(BASE, ""));

if (consoleErrors.length) check("no page-level script errors during login flow", false, consoleErrors[0]);
await browser.close();

// 12. Lockout after repeated failures (kept last: it locks the account for 15 minutes,
// so a production run skips it to leave the owner able to sign in).
if (process.env.SKIP_LOCKOUT === "1") {
  console.log("SKIP lockout probe (SKIP_LOCKOUT=1)");
}
let lastStatus = 0;
let retryAfter = "";
for (let attempt = 0; process.env.SKIP_LOCKOUT !== "1" && attempt < 6; attempt += 1) {
  const response = await login({ username: OWNER, password: `wrong-${attempt}` }, ip(40 + attempt));
  lastStatus = response.status;
  if (response.status === 429) retryAfter = response.headers.get("retry-after") || "";
}
if (process.env.SKIP_LOCKOUT !== "1") {
  check("repeated failures lock the account", lastStatus === 429, `status ${lastStatus}, Retry-After ${retryAfter}`);
}

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
console.log(failures.length ? "OVERALL FAIL" : "OVERALL PASS");
process.exit(failures.length ? 1 : 0);
