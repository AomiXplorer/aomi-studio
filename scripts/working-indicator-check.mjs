/** Sends one real prompt and captures the "Aomi is working" indicator while it runs. */
import puppeteer from "puppeteer-core";
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3104";
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
  fetch(env.UPSTASH_REDIS_REST_URL, { method: "POST", headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }, body: JSON.stringify(args) }).then((r) => r.json());
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
const token = `${body}.${b64(createHmac("sha256", env.AOMI_SESSION_SECRET).update(body).digest())}`;

const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await browser.setCookie({ name: "aomi_session", value: token, domain: new URL(BASE).hostname, path: "/", httpOnly: true });
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await page.evaluate(() => {
  window.localStorage.setItem("aomi:theme", "dark");
  document.documentElement.classList.add("dark");
});
await new Promise((resolve) => setTimeout(resolve, 1500));

await page.click("#aomi-composer");
await page.keyboard.type("halo, kenalan dulu");
await page.keyboard.press("Enter");

let seen = null;
const started = Date.now();
while (Date.now() - started < 25000) {
  const state = await page.evaluate(() => {
    const dots = document.querySelector(".aomi-think");
    const pulse = document.querySelector(".aomi-pulse");
    const label = document.querySelector(".aomi-pulse")?.parentElement?.textContent?.trim() || null;
    return { dots: Boolean(dots), pulse: Boolean(pulse), label };
  });
  if (state.dots || state.pulse) {
    seen = state;
    await page.screenshot({ path: "ui-shots/redesign/15-working.png" });
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
}
console.log("working indicator:", JSON.stringify(seen));
await new Promise((resolve) => setTimeout(resolve, 4000));
const outcome = await page.evaluate(() => ({
  maintenance: document.body.innerText.includes("Web Under maintenance"),
  error: document.querySelector('[role="alert"]')?.textContent?.slice(0, 90) || null,
  answer: [...document.querySelectorAll("li")].map((node) => node.textContent?.trim()).filter(Boolean).slice(-1)[0]?.slice(0, 120) || null,
}));
console.log("outcome:", JSON.stringify(outcome));
await browser.close();
