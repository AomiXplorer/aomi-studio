import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:3114";
const OUT = process.env.OUT || "ui-shots/shell";
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });

const lum = (rgb) => {
  const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (fg, bg) => {
  const a = lum(fg);
  const b = lum(bg);
  return ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
};

async function audit(width, height, name, mobile = false) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1200));
  const report = await page.evaluate(() => {
    const textChecks = [];
    const walk = document.querySelectorAll("p, label, span, li, h1, code, a");
    for (const el of walk) {
      const s = getComputedStyle(el);
      const size = parseFloat(s.fontSize);
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!own || size > 14) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      textChecks.push({ text: el.textContent.trim().slice(0, 26), color: s.color, size });
    }
    const submit = document.querySelector('button[type="submit"]');
    const toggle = document.querySelector('button[aria-label*="password"]');
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      docHeight: document.documentElement.scrollHeight,
      h1: document.querySelector("h1")?.textContent.trim(),
      h1Font: getComputedStyle(document.querySelector("h1")).fontFamily,
      submit: submit ? Math.round(submit.getBoundingClientRect().height) : null,
      toggleH: toggle ? Math.round(toggle.getBoundingClientRect().height) : null,
      railItems: document.querySelectorAll(".sh-ticker-track li").length,
      animations: document.getAnimations().length,
      samples: textChecks.slice(0, 40),
    };
  });
  const bg = "rgb(9, 9, 11)";
  const worst = report.samples
    .map((s) => ({ ...s, contrast: ratio(s.color, bg) }))
    .sort((a, b) => Number(a.contrast) - Number(b.contrast))
    .slice(0, 4);
  console.log(
    name,
    JSON.stringify({
      overflow: report.scrollWidth - report.clientWidth,
      scrollWidth: report.scrollWidth,
      docHeight: report.docHeight,
      h1: report.h1,
      h1Font: report.h1Font,
      submit: report.submit,
      toggleH: report.toggleH,
      railItems: report.railItems,
      animations: report.animations,
      lowestContrast: worst,
    }),
  );
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: mobile });
  await page.close();
}

await audit(1440, 900, "desktop");
await audit(1280, 800, "laptop");
await audit(390, 844, "mobile", true);
await browser.close();
