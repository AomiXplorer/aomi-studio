// Headless UI check: overflow, console errors and screenshots for every page.
// Usage: node scripts/ui-check.mjs <projectId>   (server must be running)
import puppeteer from "puppeteer-core";

const BASE = process.env.AOMI_BASE || "http://127.0.0.1:3100";
const PID = process.argv[2] || "PROJECT_ID";
const pages = [
  ["chat", "/chat"],
  ["projects", "/projects"],
  ["workspace", `/projects/${PID}`],
  ["image", "/studio/image"],
  ["audio", "/studio/audio"],
  ["settings", "/settings"],
];
const viewports = [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

const report = [];
for (const [label, path] of pages) {
  for (const [vp, width, height] of viewports) {
    const page = await browser.newPage();
    const errors = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text().slice(0, 140)); });
    page.on("pageerror", (err) => errors.push(String(err).slice(0, 140)));
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const info = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      return {
        bg: body.backgroundColor,
        color: body.color,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        h1: document.querySelector("h1")?.textContent?.slice(0, 60) || null,
        text: document.body.innerText.slice(0, 120).replace(/\n/g, " | "),
      };
    });
    const file = `/tmp/shots/${label}-${vp}.png`;
    await page.screenshot({ path: file, fullPage: vp === "desktop" });
    report.push({ label, vp, overflow: info.scrollW > info.innerW + 1, ...info, errors: [...new Set(errors)].slice(0, 3), file });
    await page.close();
  }
}
await browser.close();
for (const row of report) {
  console.log(`${row.label}/${row.vp}: overflow=${row.overflow} bg=${row.bg} scroll=${row.scrollW}/${row.innerW} h1=${row.h1 ? "yes" : "no"}`);
  if (row.errors.length) console.log(`   errors: ${row.errors.join(" ~ ")}`);
}
