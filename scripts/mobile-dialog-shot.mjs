/** Mobile drawer + delete dialog screenshot on production. */
import puppeteer from "puppeteer-core";
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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
const UA = "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const b64 = (buffer) => Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ua = b64(createHash("sha256").update(UA).digest()).slice(0, 16);
const now = Math.floor(Date.now() / 1000);
const body = b64(JSON.stringify({ sub: owner.username, uid: owner.id, role: "admin", ver: Number(owner.sessionVersion || 1), iat: now, exp: now + 3600, ua }));
const token = `${body}.${b64(createHmac("sha256", env.AOMI_SESSION_SECRET).update(body).digest())}`;

const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await browser.setCookie({ name: "aomi_session", value: token, domain: "vierraapi.my.id", path: "/", httpOnly: true, secure: true });

await page.goto("https://vierraapi.my.id/chat", { waitUntil: "networkidle2" });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("aomi:theme", "dark");
  document.documentElement.classList.add("dark");
});
await page.reload({ waitUntil: "networkidle2" });
await new Promise((resolve) => setTimeout(resolve, 1800));

// A real project through the UI, so the drawer has a row to act on.
await page.click('[aria-haspopup="listbox"]');
await new Promise((resolve) => setTimeout(resolve, 400));
await page.evaluate(() => {
  [...document.querySelectorAll('[role="listbox"] button')].find((button) => button.textContent.includes("Project baru"))?.click();
});
await page.waitForSelector('input[placeholder="Portfolio programmer"]', { timeout: 12000 });
await page.type('input[placeholder="Portfolio programmer"]', "contoh-project");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#aomi-composer")?.placeholder?.includes("contoh-project") === true, { timeout: 30000 });
await new Promise((resolve) => setTimeout(resolve, 1500));

await page.click('[aria-label="Buka menu"]');
await new Promise((resolve) => setTimeout(resolve, 800));
console.log("drawer rows:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("aside li a")].map((node) => node.textContent.trim()))));
const opened = await page.evaluate(() => {
  const button = document.querySelector('aside li button[aria-label^="Hapus project"]');
  if (!button) return false;
  button.click();
  return true;
});
if (opened) {
  await new Promise((resolve) => setTimeout(resolve, 700));
  console.log("trash triggered:", opened, "dialog open:", await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]'))));
  console.log("row labels:", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("aside li")].map((li) => li.textContent.trim()))));
  console.log("overflowX:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
  await page.screenshot({ path: "ui-shots/redesign/11-mobile-dialog.png" });
  // Finish the job on mobile: delete the demo project for real.
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="dialog"] button')].find((node) => node.textContent.trim().startsWith("Hapus project"))?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 2200));
  console.log("row gone after delete:", await page.evaluate(() => !document.querySelector('[aria-label="Hapus project contoh-project"]')));
}
await browser.close();
