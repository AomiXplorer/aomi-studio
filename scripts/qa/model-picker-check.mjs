#!/usr/bin/env node
/**
 * Local check for the composer model picker, at both breakpoints.
 *
 * The panel used to live inside the 32px composer toolbar that carries `overflow: hidden`,
 * so it was clipped to nothing: no scroll, no hit area, no picks. This check pins the
 * behaviour back down. It serves a fake provider catalogue on port 4599, so start the app
 * with BANGUNWEB_BASE_URL=http://127.0.0.1:4599 BANGUNWEB_API_KEY=qa first.
 *
 * Usage: node scripts/qa/model-picker-check.mjs [baseUrl]
 */
import puppeteer from "puppeteer-core";
import { createServer } from "node:http";

const BASE = process.argv[2] || "http://127.0.0.1:3200";
const PORT = 4599;
const CATALOGUE = 24;

const families = ["Aomi", "Nova", "Lumen", "Sable", "Atlas", "Mint", "Zenith", "Halo", "Drift", "Ember"];
const data = Array.from({ length: CATALOGUE }, (_, i) => ({
  id: `aomi-model-${i + 1}`,
  display_name: `Aomi Model ${i + 1}`,
  bangunweb: { kind: "text", family: families[i % families.length], tier: i % 3 ? "balanced" : "premium", default: i === 0 },
}));

const provider = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url.startsWith("/models")) return res.end(JSON.stringify({ data }));
  res.statusCode = 404;
  res.end(JSON.stringify({ error: { message: "not mocked" } }));
});

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` ${detail}` : ""}`);
};

await new Promise((resolve) => provider.listen(PORT, resolve));
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });

async function signIn(page, username, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 60000 });
  if (page.url().includes("/login")) {
    await page.type("#username", username);
    await page.type("#password", password);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')]);
  }
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
}

const CHIP = 'button[aria-haspopup="listbox"][aria-label^="Model"]';
const LIST = '[aria-label="Model tersedia"]';

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await signIn(page, "owner", "qa-pass-123");
  await page.click(CHIP);
  await new Promise((r) => setTimeout(r, 800));

  const desktop = await page.evaluate((sel) => {
    const ul = document.querySelector(sel);
    if (!ul) return { open: false };
    const r = ul.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + 40));
    return {
      open: true,
      opts: ul.querySelectorAll('[role="option"]').length,
      clientHeight: ul.clientHeight,
      scrollHeight: ul.scrollHeight,
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
      hitInside: Boolean(hit?.closest(sel)),
    };
  }, LIST);

  check("desktop panel renders", desktop.open);
  check("desktop panel sits inside the viewport", Boolean(desktop.inViewport));
  check("desktop panel receives the pointer", Boolean(desktop.hitInside));
  check("desktop list overflows its box", desktop.scrollHeight > desktop.clientHeight);
  check("desktop list shows the whole catalogue", desktop.opts === CATALOGUE, `${desktop.opts}`);

  const ulBox = await (await page.$(LIST)).boundingBox();
  await page.mouse.move(ulBox.x + ulBox.width / 2, ulBox.y + 60);
  await page.mouse.wheel({ deltaY: 400 });
  await new Promise((r) => setTimeout(r, 500));
  const wheelTop = await page.$eval(LIST, (u) => u.scrollTop);
  check("desktop wheel scrolls the list", wheelTop > 100, `scrollTop=${Math.round(wheelTop)}`);

  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 300));
  check("Escape closes the panel", await page.evaluate((sel) => !document.querySelector(sel), LIST));
  await page.close();

  const phone = await browser.newPage();
  await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await signIn(phone, "owner", "qa-pass-123");
  await phone.click(CHIP);
  await new Promise((r) => setTimeout(r, 900));

  const sheet = await phone.evaluate((sel) => {
    const ul = document.querySelector(sel);
    if (!ul) return { open: false };
    const r = ul.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + 40));
    return { open: true, scrollTop: ul.scrollTop, hitInside: Boolean(hit?.closest(sel)) };
  }, LIST);
  check("phone sheet renders", sheet.open);
  check("phone sheet receives touches", Boolean(sheet.hitInside));

  const client = await phone.createCDPSession();
  const box = await (await phone.$(LIST)).boundingBox();
  const x = box.x + box.width / 2;
  const startY = box.y + box.height - 50;
  const touch = (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ x, y: startY, id: 1 }]);
  for (let i = 1; i <= 12; i++) {
    await touch("touchMove", [{ x, y: startY - i * 14, id: 1 }]);
    await new Promise((r) => setTimeout(r, 16));
  }
  await touch("touchEnd", []);
  await new Promise((r) => setTimeout(r, 800));
  const dragTop = await phone.$eval(LIST, (u) => u.scrollTop).catch(() => -1);
  check("phone drag scrolls the sheet", dragTop > 60, `scrollTop=${Math.round(dragTop)}`);

  const pick = await phone.evaluate((sel) => {
    const opts = [...document.querySelectorAll(`${sel} [role="option"]`)];
    const el = opts[6];
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const label = el.querySelector("span.block")?.textContent?.trim() || el.textContent.trim();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, label };
  }, LIST);
  await new Promise((r) => setTimeout(r, 400));
  await phone.touchscreen.tap(pick.x, pick.y);
  await new Promise((r) => setTimeout(r, 900));
  const applied = await phone.evaluate((sel) => ({
    open: Boolean(document.querySelector(sel)),
    chip: document.querySelector('button[aria-haspopup="listbox"][aria-label^="Model"]').textContent.trim(),
  }), LIST);
  check("phone tap picks a model", !applied.open && applied.chip.startsWith(pick.label), `${applied.chip} / ${pick.label}`);
  await phone.close();
} finally {
  await browser.close();
  provider.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
