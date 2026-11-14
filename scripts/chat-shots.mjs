/**
 * Screenshots and geometry checks of the chat surface, as a signed-in owner.
 *
 * The owner password never lives in this repo, so the script mints the same signed
 * cookie the app issues (HMAC over the session claims) from AOMI_SESSION_SECRET, and
 * reads the account id + session version straight from Redis.
 */
import puppeteer from "puppeteer-core";
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "https://vierraapi.my.id";
const OUT = process.argv[3] || "ui-shots/redesign";

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
if (!owner) throw new Error("no admin account found in Redis");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const b64 = (buffer) => Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ua = b64(createHash("sha256").update(UA).digest()).slice(0, 16);
const now = Math.floor(Date.now() / 1000);
const claims = {
  sub: owner.username,
  uid: owner.id,
  role: "admin",
  ver: Number(owner.sessionVersion || 1),
  iat: now,
  exp: now + 3600,
  ua,
};
const body = b64(JSON.stringify(claims));
const token = `${body}.${b64(createHmac("sha256", env.AOMI_SESSION_SECRET).update(body).digest())}`;

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setUserAgent(UA);
await browser.setCookie({
  name: "aomi_session",
  value: token,
  domain: new URL(BASE).hostname,
  path: "/",
  httpOnly: true,
  secure: true,
});

async function shoot(name, width, height, theme) {
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
  await page.evaluate((value) => window.localStorage.setItem("aomi:theme", value), theme);
  await page.evaluate(() => document.documentElement.classList.toggle("dark", window.localStorage.getItem("aomi:theme") !== "light"));
  await new Promise((resolve) => setTimeout(resolve, 900));
  const metrics = await page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height), width: Math.round(rect.width) };
    };
    const header = document.querySelector("header");
    const contextBar = document.querySelectorAll("header")[1] || null;
    const heading = document.querySelector("h1");
    const style = heading ? getComputedStyle(heading) : null;
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      appHeader: header ? { bottom: Math.round(header.getBoundingClientRect().bottom), height: Math.round(header.getBoundingClientRect().height) } : null,
      contextBar: contextBar ? { top: Math.round(contextBar.getBoundingClientRect().top), height: Math.round(contextBar.getBoundingClientRect().height) } : null,
      headingFont: style ? style.fontSize : null,
      headingWidth: heading ? Math.round(heading.getBoundingClientRect().width) : null,
      composer: box("#aomi-composer") ? box("#aomi-composer").width : null,
      composerBottomGap: (() => {
        const el = document.querySelector("#aomi-composer");
        if (!el) return null;
        const card = el.closest("div[class*='rounded-[20px]']") || el.parentElement;
        const rect = card.getBoundingClientRect();
        return Math.round(window.innerHeight - rect.bottom);
      })(),
      cards: document.querySelectorAll("ul li button").length,
      h1Text: heading ? heading.textContent.trim().slice(0, 40) : null,
    };
  });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, JSON.stringify(metrics));
}

await shoot("01-chat-desktop-dark", 1440, 900, "dark");
await shoot("02-chat-desktop-light", 1440, 900, "light");
await shoot("03-chat-mobile-dark", 390, 844, "dark");
await shoot("04-chat-small-dark", 360, 780, "dark");
await shoot("05-chat-320-dark", 320, 720, "dark");

// Interaction pass: the project switcher, its keyboard escape and the new-project dialog.
if (process.argv.includes("--interact")) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
  await new Promise((resolve) => setTimeout(resolve, 800));

  await page.click('[aria-haspopup="listbox"]');
  await new Promise((resolve) => setTimeout(resolve, 250));
  const opened = await page.evaluate(() => {
    const list = document.querySelector('[role="listbox"]');
    return {
      open: Boolean(list),
      options: list ? list.querySelectorAll('[role="option"]').length : 0,
      fitsViewport: list ? list.getBoundingClientRect().right <= window.innerWidth && list.getBoundingClientRect().left >= 0 : false,
    };
  });
  console.log("switcher open", JSON.stringify(opened));

  await page.keyboard.press("Escape");
  await new Promise((resolve) => setTimeout(resolve, 200));
  console.log("closes on escape", await page.evaluate(() => !document.querySelector('[role="listbox"]')));

  await page.click('[aria-haspopup="listbox"]');
  await new Promise((resolve) => setTimeout(resolve, 200));
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[role="listbox"] button')];
    buttons.find((button) => button.textContent.includes("Project baru"))?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const dialog = await page.evaluate(() => {
    const input = document.querySelector('input[placeholder="Portfolio programmer"]');
    const card = input ? input.closest("div[class*='rounded-xl']") : null;
    const rect = card ? card.getBoundingClientRect() : null;
    return { open: Boolean(input), inside: rect ? rect.left >= 0 && rect.right <= window.innerWidth : false };
  });
  console.log("new project dialog", JSON.stringify(dialog));
  await page.keyboard.press("Escape");
  await new Promise((resolve) => setTimeout(resolve, 200));

  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("ul li button")].slice(0, 4).map((button) => ({
      label: button.textContent.replace(/\s+/g, " ").trim().slice(0, 34),
      enabled: !button.disabled,
      height: Math.round(button.getBoundingClientRect().height),
    })),
  );
  console.log("cards", JSON.stringify(cards));
  await page.screenshot({ path: `${OUT}/06-mobile-switcher.png` });
}

// Theme is left on dark for the app it ships in.
await page.evaluate(() => window.localStorage.setItem("aomi:theme", "dark"));
await browser.close();
