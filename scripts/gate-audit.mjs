import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3113";
mkdirSync("ui-shots/gate", { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });

async function audit(width, height, name, mobile = false) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1400));
  const report = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const h1 = document.querySelector("h1");
    const submit = document.querySelector('button[type="submit"]');
    const reveal = document.querySelector('button[aria-label*="password"]');
    const cs = h1 ? getComputedStyle(h1) : null;
    const small = Array.from(document.querySelectorAll("p, dd, dt, label, span")).filter((el) => {
      const s = getComputedStyle(el);
      return parseFloat(s.fontSize) <= 11 && el.textContent.trim().length > 0;
    });
    const colours = new Set(small.map((el) => getComputedStyle(el).color));
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      docHeight: document.documentElement.scrollHeight,
      h1: box("h1"),
      h1Font: cs?.fontFamily,
      h1Size: cs?.fontSize,
      form: box("form"),
      submit: box('button[type="submit"]'),
      revealSize: reveal ? { w: Math.round(reveal.getBoundingClientRect().width), h: Math.round(reveal.getBoundingClientRect().height) } : null,
      smallTextColours: Array.from(colours),
      animated: document.getAnimations().length,
      offscreen: Array.from(document.querySelectorAll(".gate *"))
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 4)
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 28)}`),
    };
  });
  console.log(name, JSON.stringify(report));
  await page.screenshot({ path: `ui-shots/gate/${name}.png`, fullPage: mobile });
  await page.close();
}

await audit(1440, 900, "desktop");
await audit(390, 844, "mobile", true);
await browser.close();
