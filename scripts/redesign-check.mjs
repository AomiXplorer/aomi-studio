/** Verifies the Aomi chat redesign: copy, motion, cards, composer, mobile fit. */
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
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(message.text().slice(0, 160));
});
page.on("pageerror", (error) => problems.push(`pageerror: ${String(error).slice(0, 160)}`));
await browser.setCookie({ name: "aomi_session", value: token, domain: new URL(BASE).hostname, path: "/", httpOnly: true });

// The hero only exists in an empty project, so make one through the UI first.
async function makeEmptyProject() {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    window.localStorage.setItem("aomi:theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await page.click('[aria-haspopup="listbox"]');
  await new Promise((resolve) => setTimeout(resolve, 350));
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="listbox"] button')].find((button) => button.textContent.includes("Project baru"))?.click();
  });
  await page.waitForSelector('input[placeholder="Portfolio programmer"]', { timeout: 12000 });
  await page.type('input[placeholder="Portfolio programmer"]', "hero-uji");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#aomi-composer")?.placeholder?.includes("hero-uji") === true, { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 900));
}

await makeEmptyProject();

const views = [
  { name: "390x844", width: 390, height: 844 },
  { name: "360x780", width: 360, height: 780 },
  { name: "320x720", width: 320, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
];
const report = [];

for (const view of views) {
  await page.setViewport({ width: view.width, height: view.height, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    window.localStorage.setItem("aomi:theme", "dark");
    document.documentElement.classList.add("dark");
  });
  // Wait for the hero instead of guessing at a delay: a cold chunk load can take longer
  // than a warm reload, and measuring mid-boot would report an empty page.
  await page.waitForFunction(
    () => Boolean(document.querySelector("h1") || document.querySelector("ul > li > button.aomi-card")),
    { timeout: 20000 },
  ).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const data = await page.evaluate(() => {
    const heading = document.querySelector("h1");
    const cards = [...document.querySelectorAll("ul > li > button.aomi-card")];
    const hero = heading?.closest("div.relative");
    const composer = document.querySelector("#aomi-composer");
    const cardStyle = cards[0] ? getComputedStyle(cards[0]) : null;
    return {
      headline: heading?.textContent?.trim(),
      headlineSize: heading ? getComputedStyle(heading).fontSize : null,
      eyebrow: document.querySelector("p.aomi-enter")?.textContent?.trim().slice(0, 40),
      description: [...document.querySelectorAll("p")].find((node) => node.textContent?.includes("Punya ide"))?.textContent?.trim(),
      cards: cards.length,
      cardRadius: cardStyle?.borderRadius,
      cardTransition: cardStyle?.transitionProperty,
      // The entrance lives on the list item, the press/hover motion on the button.
      cardAnimations: [...document.querySelectorAll("ul > li.aomi-enter")].map((item) => getComputedStyle(item).animationName),
      cardDelays: [...document.querySelectorAll("ul > li.aomi-enter")].map((item) => getComputedStyle(item).animationDelay),
      heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : null,
      placeholder: composer?.placeholder,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      composerBottom: composer ? Math.round(window.innerHeight - composer.getBoundingClientRect().bottom) : null,
      pageAnim: getComputedStyle(document.querySelector(".aomi-page")).animationName,
      ambient: Boolean(document.querySelector(".aomi-ambient")),
    };
  });
  report.push({ view: view.name, ...data });
}
console.table(report.map(({ view, headline, headlineSize, cards, heroHeight, overflowX, composerBottom, pageAnim, ambient }) => ({ view, headline, headlineSize, cards, heroHeight, overflowX, composerBottom, pageAnim, ambient })));
console.log("copy:", JSON.stringify({ eyebrow: report[0].eyebrow, description: report[0].description, placeholder: report[0].placeholder }));
console.log("card motion:", JSON.stringify({ radius: report[0].cardRadius, transition: report[0].cardTransition, animations: report[0].cardAnimations, delays: report[0].cardDelays }));

// hover and press behaviour on one card
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await page.waitForSelector("button.aomi-card", { timeout: 12000 });
await new Promise((resolve) => setTimeout(resolve, 700));
const card = await page.$("button.aomi-card");
const box = await card.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((resolve) => setTimeout(resolve, 320));
const hover = await page.evaluate(() => ({
  transform: getComputedStyle(document.querySelector("button.aomi-card")).transform,
  sheen: getComputedStyle(document.querySelector("button.aomi-card"), "::after").opacity,
}));
await page.mouse.down();
await new Promise((resolve) => setTimeout(resolve, 140));
const pressed = await page.evaluate(() => getComputedStyle(document.querySelector("button.aomi-card")).transform);
// Slide off the card before releasing so the measurement cannot trigger a click.
await page.mouse.move(4, 4);
await page.mouse.up();
console.log("card hover:", JSON.stringify(hover), "pressed:", pressed);

// composer focus ring
await page.click("#aomi-composer");
await new Promise((resolve) => setTimeout(resolve, 260));
console.log(
  "composer focus:",
  JSON.stringify(
    await page.evaluate(() => {
      const shell = document.querySelector(".aomi-composer-shell");
      const style = getComputedStyle(shell);
      return { border: style.borderColor, shadow: style.boxShadow.slice(0, 60) };
    }),
  ),
);

// route transition
await page.goto(`${BASE}/projects`, { waitUntil: "networkidle2" });
await new Promise((resolve) => setTimeout(resolve, 400));
console.log("route anim:", JSON.stringify(await page.evaluate(() => {
  const node = document.querySelector(".aomi-page");
  const style = getComputedStyle(node);
  return { name: style.animationName, duration: style.animationDuration };
})));

// screenshots
for (const shot of [
  { path: "ui-shots/redesign/12-hero-mobile.png", width: 390, height: 844, theme: "dark" },
  { path: "ui-shots/redesign/13-hero-desktop.png", width: 1440, height: 900, theme: "dark" },
  { path: "ui-shots/redesign/14-hero-mobile-light.png", width: 390, height: 844, theme: "light" },
]) {
  await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
  await page.evaluate((theme) => {
    window.localStorage.setItem("aomi:theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, shot.theme);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await page.screenshot({ path: shot.path });
}

// reduced motion
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await page.waitForFunction(() => Boolean(document.querySelector("button.aomi-card")), { timeout: 20000 }).catch(() => undefined);
await new Promise((resolve) => setTimeout(resolve, 400));
console.log(
  "reduced motion:",
  JSON.stringify(
    await page.evaluate(() => {
      const card = document.querySelector("button.aomi-card");
      const style = getComputedStyle(card);
      return { animationDuration: style.animationDuration, transitionDuration: style.transitionDuration };
    }),
  ),
);

// leave the account as it was
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await new Promise((resolve) => setTimeout(resolve, 900));
const cleaned = await page.evaluate(async () => {
  const id = window.localStorage.getItem("aomi:project");
  if (!id) return false;
  await fetch(`/api/projects/${id}`, { method: "DELETE" }).catch(() => undefined);
  return true;
});
console.log("cleanup:", cleaned);

console.log("console problems:", problems.length ? JSON.stringify(problems.slice(0, 4)) : "none");
await browser.close();
