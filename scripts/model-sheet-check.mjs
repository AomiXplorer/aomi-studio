/** The model sheet must sit above the page, opaque, one viewport wide. */
import puppeteer from "puppeteer-core";
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3105";
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
const b64 = (buffer) => Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sign = (UA) => {
  const ua = b64(createHash("sha256").update(UA).digest()).slice(0, 16);
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ sub: owner.username, uid: owner.id, role: "admin", ver: Number(owner.sessionVersion || 1), iat: now, exp: now + 3600, ua }));
  return { UA, token: `${body}.${b64(createHmac("sha256", env.AOMI_SESSION_SECRET).update(body).digest())}` };
};

const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const problems = [];

async function run(label, UA, viewport, shot) {
  const { token } = sign(UA);
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport(viewport);
  page.on("pageerror", (error) => problems.push(`${label}: ${String(error).slice(0, 110)}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`${label}: ${message.text().slice(0, 110)}`);
  });
  await browser.setCookie({ name: "aomi_session", value: token, domain: new URL(BASE).hostname, path: "/", httpOnly: true });
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    window.localStorage.setItem("aomi:theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await new Promise((resolve) => setTimeout(resolve, 1800));
  await page.waitForSelector('[aria-label^="Model:"]', { timeout: 20000 });
  await page.click('[aria-label^="Model:"]');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const geometry = await page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"][aria-label="Pilih model"]');
    const box = sheet?.getBoundingClientRect();
    const style = sheet ? getComputedStyle(sheet) : null;
    const cards = [...document.querySelectorAll("button.aomi-card")].map((card) => card.getBoundingClientRect());
    const sheetTop = box ? box.top : 0;
    const overlap = cards.filter((card) => card.bottom > sheetTop && card.top < (box?.bottom ?? 0)).length;
    return {
      width: Math.round(box?.width ?? 0),
      viewportWidth: window.innerWidth,
      bottomGap: Math.round(window.innerHeight - (box?.bottom ?? 0)),
      top: Math.round(sheetTop),
      background: style?.backgroundColor,
      opacity: style?.opacity,
      parentIsBody: sheet?.parentElement?.parentElement === document.body || sheet?.parentElement === document.body,
      cardsBehindSheet: overlap,
      // What actually paints at a point inside a hero card: the sheet or the card?
      hitTestOverCards: cards.slice(0, 3).map((card) => {
        const node = document.elementFromPoint(Math.round(card.left + card.width / 2), Math.round(card.top + card.height / 2));
        return node ? (node.closest('[aria-label="Pilih model"]') ? "sheet" : node.closest("button.aomi-card") ? "card" : node.tagName.toLowerCase()) : "none";
      }),
      rows: [...document.querySelectorAll('[role="option"]')].map((row) => Math.round(row.getBoundingClientRect().height)),
      listScrolls: (() => {
        const list = document.querySelector('[role="listbox"][aria-label="Model tersedia"]');
        return list ? list.scrollHeight > list.clientHeight : null;
      })(),
      bodyOverflow: document.body.style.overflow,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  console.log(label, JSON.stringify(geometry));
  if (shot) await page.screenshot({ path: shot });
  await page.close();
  return geometry;
}

const mobile = await run("mobile", "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "ui-shots/redesign/16-model-sheet-fixed.png");
const desktop = await run("desktop", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", { width: 1440, height: 900, deviceScaleFactor: 2 }, "ui-shots/redesign/17-model-panel-desktop.png");
console.log("checks:", JSON.stringify({
  sheetFullWidth: mobile.width === mobile.viewportWidth && desktop.width === 320,
  opaque: mobile.background !== "rgba(0, 0, 0, 0)" && mobile.opacity === "1",
  paintsAbovePage: mobile.hitTestOverCards.some((hit) => hit === "sheet"),
  noSquashedRows: mobile.rows.every((height) => height >= 40) && desktop.rows.every((height) => height >= 36),
  listScrolls: mobile.listScrolls === true,
  scrollLocked: mobile.bodyOverflow === "hidden",
  noOverflow: mobile.overflowX === 0 && desktop.overflowX === 0,
  portal: mobile.parentIsBody,
}));
console.log("problems:", problems.length ? JSON.stringify(problems.slice(0, 3)) : "none");
await browser.close();
