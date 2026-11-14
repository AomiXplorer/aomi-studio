import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:3114";
const OUT = process.env.OUT || "ui-shots/shell";
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });

// 1. The page as it arrives.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (const [index, delay] of [80, 200, 340, 800].entries()) {
    await new Promise((r) => setTimeout(r, delay));
    await page.screenshot({ path: `${OUT}/entry-${index + 1}.png` });
  }
  await page.close();
}

// 2. Settled, focus, error, pending.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/desktop.png` });

  // The rail has to actually move, not just exist.
  const before = await page.$eval(".sh-ticker-track", (el) => getComputedStyle(el).transform);
  await new Promise((r) => setTimeout(r, 1200));
  const after = await page.$eval(".sh-ticker-track", (el) => getComputedStyle(el).transform);
  console.log("tool rail moves:", before !== after, "|", before, "->", after);

  await page.type("#username", "Aomixplorer");
  await page.click("#password");
  await new Promise((r) => setTimeout(r, 420));
  await page.screenshot({ path: `${OUT}/focus.png` });

  await page.type("#password", "salah-sekali");
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => Boolean(document.querySelector("#login-error")), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 360));
  await page.screenshot({ path: `${OUT}/error.png` });
  console.log("error line:", await page.$eval("#login-error", (el) => el.textContent.trim()));
  await page.close();
}

// 3. Pending: hold the response so the checking state can be seen.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    if (request.url().endsWith("/api/auth/login")) await new Promise((r) => setTimeout(r, 2800));
    request.continue();
  });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#username", "Aomixplorer");
  await page.type("#password", "password-panjang");
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 700));
  const label = await page.$eval('button[type="submit"]', (el) => el.textContent.trim());
  const log = await page.$eval('[aria-live="polite"]', (el) => el.textContent.trim());
  console.log("pending:", JSON.stringify({ label, log }));
  await page.screenshot({ path: `${OUT}/pending.png` });
  await page.close();
}

// 4. Mobile.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/mobile.png` });
  await page.close();
}

// 5. Reduced motion: content must be fully visible, rail stationary.
{
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 400));
  const a = await page.$eval(".sh-ticker-track", (el) => getComputedStyle(el).transform);
  await new Promise((r) => setTimeout(r, 900));
  const b = await page.$eval(".sh-ticker-track", (el) => getComputedStyle(el).transform);
  const heading = await page.$eval("h1", (el) => ({ text: el.textContent.trim(), opacity: getComputedStyle(el).opacity }));
  console.log("reduced motion:", JSON.stringify({ railStill: a === b, heading }));
  await page.screenshot({ path: `${OUT}/reduced-motion.png` });
  await page.close();
}

await browser.close();
