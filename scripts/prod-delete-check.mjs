/** Production proof: sidebar delete removes the project for good, and the ZIP has no extra markdown. */
import puppeteer from "puppeteer-core";
import { createHmac, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "https://vierraapi.my.id";
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
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const b64 = (buffer) => Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ua = b64(createHash("sha256").update(UA).digest()).slice(0, 16);
const now = Math.floor(Date.now() / 1000);
const body = b64(JSON.stringify({ sub: owner.username, uid: owner.id, role: "admin", ver: Number(owner.sessionVersion || 1), iat: now, exp: now + 3600, ua }));
const token = `${body}.${b64(createHmac("sha256", env.AOMI_SESSION_SECRET).update(body).digest())}`;

const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await browser.setCookie({ name: "aomi_session", value: token, domain: "vierraapi.my.id", path: "/", httpOnly: true, secure: true });
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await page.evaluate(() => {
  window.localStorage.clear();
  window.localStorage.setItem("aomi:theme", "dark");
  document.documentElement.classList.add("dark");
});
await page.reload({ waitUntil: "networkidle2" });
await new Promise((resolve) => setTimeout(resolve, 1600));

await page.click('[aria-haspopup="listbox"]');
await new Promise((resolve) => setTimeout(resolve, 300));
await page.evaluate(() => {
  [...document.querySelectorAll('[role="listbox"] button')].find((button) => button.textContent.includes("Project baru"))?.click();
});
await page.waitForSelector('input[placeholder="Portfolio programmer"]', { timeout: 10000 });
await page.type('input[placeholder="Portfolio programmer"]', "uji-hapus");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#aomi-composer")?.placeholder?.includes("uji-hapus") === true, { timeout: 30000 });
await new Promise((resolve) => setTimeout(resolve, 1500));

console.log("sidebar row + trash:", await page.evaluate(() => Boolean(document.querySelector('[aria-label="Hapus project uji-hapus"]'))));
await page.click('[aria-label="Hapus project uji-hapus"]');
await new Promise((resolve) => setTimeout(resolve, 400));
await page.screenshot({ path: "ui-shots/redesign/10-delete-dialog.png" });
await page.evaluate(() => {
  [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim().startsWith("Hapus project"))?.click();
});
await new Promise((resolve) => setTimeout(resolve, 2200));
console.log(
  "after delete:",
  JSON.stringify(
    await page.evaluate(() => ({
      rowGone: !document.querySelector('[aria-label="Hapus project uji-hapus"]'),
      sidebar: [...document.querySelectorAll("aside li a")].map((node) => node.textContent.trim()),
    })),
  ),
);
await page.reload({ waitUntil: "networkidle2" });
await new Promise((resolve) => setTimeout(resolve, 1800));
console.log("survives reload:", await page.evaluate(() => !document.body.innerText.includes("uji-hapus")));
await browser.close();

const zip = await fetch(`${BASE}/api/projects/uji-hapus/export`, {
  method: "POST",
  headers: { Cookie: `aomi_session=${token}`, "Content-Type": "application/json", "User-Agent": UA },
  body: JSON.stringify({
    workspace: {
      project: { id: "uji-hapus", name: "uji-hapus" },
      files: [
        { path: "index.html", content: "<h1>hi</h1>", encoding: "utf8" },
        { path: "src/note.txt", content: "catatan", encoding: "utf8" },
      ],
    },
  }),
});
writeFileSync("/tmp/prod-zip.zip", Buffer.from(await zip.arrayBuffer()));
console.log("prod zip:", zip.status, "files header:", zip.headers.get("x-aomi-files"));
const JSZip = (await import("jszip")).default;
const entries = Object.keys((await JSZip.loadAsync(readFileSync("/tmp/prod-zip.zip"))).files);
console.log("prod zip entries:", JSON.stringify(entries));
