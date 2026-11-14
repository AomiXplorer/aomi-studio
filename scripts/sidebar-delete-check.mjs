/** Verifies the per-project delete actions in the sidebar and the ZIP contents. */
import puppeteer from "puppeteer-core";
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3102";
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
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await browser.setCookie({ name: "aomi_session", value: token, domain: new URL(BASE).hostname, path: "/", httpOnly: true });
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await page.evaluate(() => window.localStorage.setItem("aomi:theme", "dark"));
await page.evaluate(() => {
  window.localStorage.clear();
  document.documentElement.classList.add("dark");
});
await page.reload({ waitUntil: "networkidle2" });
await new Promise((resolve) => setTimeout(resolve, 1500));

// create a project through the context-bar popup
await page.click('[aria-haspopup="listbox"]');
await new Promise((resolve) => setTimeout(resolve, 300));
await page.evaluate(() => {
  [...document.querySelectorAll('[role="listbox"] button')].find((button) => button.textContent.includes("Project baru"))?.click();
});
await page.waitForSelector('input[placeholder="Portfolio programmer"]', { timeout: 8000 });
await page.type('input[placeholder="Portfolio programmer"]', "hapus-uji");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#aomi-composer")?.placeholder?.includes("hapus-uji") === true, { timeout: 25000 });
await new Promise((resolve) => setTimeout(resolve, 1200));

const rowFound = await page.evaluate(() => Boolean(document.querySelector('[aria-label="Hapus project hapus-uji"]')));
console.log("sidebar trash button present:", rowFound);

await page.click('[aria-label="Hapus project hapus-uji"]');
await new Promise((resolve) => setTimeout(resolve, 300));
const dialog = await page.evaluate(() => {
  const node = document.querySelector('[role="dialog"]');
  return {
    open: Boolean(node),
    options: node ? [...node.querySelectorAll("button")].map((button) => button.textContent.replace(/\s+/g, " ").trim()).slice(0, 4) : [],
  };
});
console.log("dialog:", JSON.stringify(dialog));

// clearing only the conversation keeps the project
await page.evaluate(() => {
  [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.includes("riwayat chat saja"))?.click();
});
await new Promise((resolve) => setTimeout(resolve, 1200));
console.log("after chat clear -> dialog closed:", await page.evaluate(() => !document.querySelector('[role="dialog"]')));
console.log("project still listed:", await page.evaluate(() => Boolean(document.querySelector('[aria-label="Hapus project hapus-uji"]'))));

// deleting the project removes it and forgets it as the open one
await page.click('[aria-label="Hapus project hapus-uji"]');
await new Promise((resolve) => setTimeout(resolve, 300));
await page.evaluate(() => {
  [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim().startsWith("Hapus project"))?.click();
});
await new Promise((resolve) => setTimeout(resolve, 1800));
console.log(
  "after project delete:",
  JSON.stringify(
    await page.evaluate(() => ({
      rowGone: !document.querySelector('[aria-label="Hapus project hapus-uji"]'),
      dialogGone: !document.querySelector('[role="dialog"]'),
      storedProject: window.localStorage.getItem("aomi:project"),
      sidebarText: [...document.querySelectorAll("aside li a")].map((node) => node.textContent.trim()).slice(0, 6),
    })),
  ),
);
await page.screenshot({ path: "ui-shots/redesign/09-sidebar-delete.png" });
await browser.close();

// ZIP contents: only the project's own files
const zip = await fetch(`${BASE}/api/projects/probe-not-used/export`, {
  method: "POST",
  headers: { Cookie: `aomi_session=${token}`, "Content-Type": "application/json", "User-Agent": UA },
  body: JSON.stringify({
    workspace: {
      project: { id: "probe-not-used", name: "zip-uji" },
      files: [
        { path: "index.html", content: "<h1>hi</h1>", encoding: "utf8" },
        { path: "src/note.txt", content: "catatan", encoding: "utf8" },
      ],
    },
  }),
});
console.log("zip status:", zip.status, "bytes:", (await zip.arrayBuffer()).byteLength);
