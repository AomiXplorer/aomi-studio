import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:3113";
const OUT = process.env.OUT || "ui-shots/gate";
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });

// 1. Entry filmstrip: the page as it inks itself in.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  for (const [index, delay] of [90, 220, 380, 900].entries()) {
    await new Promise((r) => setTimeout(r, delay));
    await page.screenshot({ path: `${OUT}/entry-${index + 1}.png` });
  }
  await page.close();
}

// 2. Settled desktop, focus state, error state, pending state.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `${OUT}/desktop.png` });

  await page.type("#username", "Aomixplorer");
  await page.click("#password");
  await new Promise((r) => setTimeout(r, 420));
  await page.screenshot({ path: `${OUT}/focus.png` });

  // Real rejected login: this is the state a wrong password produces.
  await page.type("#password", "salah-sekali");
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => Boolean(document.querySelector("#login-error")), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 360));
  await page.screenshot({ path: `${OUT}/error.png` });
  const sizes = await page.evaluate(() => {
    const toggle = document.querySelector('button[aria-label*="password"]');
    const r = toggle.getBoundingClientRect();
    return { toggle: { w: Math.round(r.width), h: Math.round(r.height) } };
  });
  console.log("hit targets:", JSON.stringify(sizes));
  await page.close();
}

// 3. Pending state: hold the login response so the button can be photographed mid-check.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    if (request.url().endsWith("/api/auth/login")) {
      await new Promise((r) => setTimeout(r, 2600));
    }
    request.continue();
  });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#username", "Aomixplorer");
  await page.type("#password", "password-panjang");
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 700));
  const label = await page.$eval('button[type="submit"]', (el) => el.textContent.trim());
  const animating = await page.evaluate(() => document.querySelectorAll(".gate-pending").length);
  console.log("pending label:", label, "| pending bar present:", animating);
  await page.screenshot({ path: `${OUT}/pending.png` });
  await page.close();
}

// 4. Mobile settled.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1400));
  await page.screenshot({ path: `${OUT}/mobile.png`, fullPage: true });
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  console.log("mobile overflow:", JSON.stringify(overflow));
  await page.close();
}

await browser.close();
