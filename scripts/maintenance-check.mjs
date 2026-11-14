/** Checks the maintenance state and the delete-history control in a real browser. */
import puppeteer from "puppeteer-core";
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3101";
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
const token = `${body}.${b64(createHmac("sha256", env.AOMI_SESSION_SECRET).update(body).digest())}`;

const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await browser.setCookie({ name: "aomi_session", value: token, domain: new URL(BASE).hostname, path: "/", httpOnly: true });

async function inspect(label, shot) {
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
  await page.evaluate(() => window.localStorage.setItem("aomi:theme", "dark"));
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  // Boot reads projects, then messages, then the quota mark; wait for the mark to land.
  await page.waitForFunction(
    () => !document.body.innerText.includes("Memuat workspace"),
    { timeout: 15000 },
  ).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const result = await page.evaluate(() => {
    const text = document.body.innerText;
    const composer = document.querySelector("#aomi-composer");
    return {
      maintenance: text.includes("Web Under maintenance"),
      tokenLine: /Sesi ini:|ditagihkan provider/.test(text),
      composerDisabled: composer ? composer.disabled : null,
      placeholder: composer ? composer.placeholder : null,
      trashButton: Boolean(document.querySelector('[aria-label="Hapus riwayat percakapan"]')),
    };
  });
  console.log(label, JSON.stringify(result));
  if (shot) await page.screenshot({ path: shot });
  return result;
}

const flag = { exhausted: true, since: new Date().toISOString(), detail: "uji coba jalur maintenance" };
await redis("SET", "aomi:quota:exhausted", JSON.stringify(flag), "EX", 600);
await inspect("maintenance on ", "ui-shots/redesign/07-maintenance.png");
await redis("DEL", "aomi:quota:exhausted");
await inspect("maintenance off", null);

// Telegram channel used by the alert (a labelled test message, not a fake alarm).
const adminId = (env.TELEGRAM_ADMIN_ID || process.env.TELEGRAM_ADMIN_ID || "").trim();
const sent = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: adminId, text: "Uji notifikasi: jalur peringatan limit Aomi siap dipakai." }),
}).then((response) => response.json());
console.log("telegram alert test:", sent.ok ? "delivered" : JSON.stringify(sent).slice(0, 160));

await browser.close();
