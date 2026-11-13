// Headless UI check: overflow, console errors and screenshots for every page,
// plus the real rendered pixel colour (computed styles alone can differ).
// Usage: node scripts/ui-check.mjs <baseUrl> [projectId]
//        node scripts/ui-check.mjs <projectId>        (uses AOMI_BASE, default :3100)
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";

const first = process.argv[2];
const BASE = first?.startsWith("http") ? first : process.env.AOMI_BASE || "http://127.0.0.1:3100";
const PID = first?.startsWith("http") ? process.argv[3] || "p-uicheck-0001" : first || "PROJECT_ID";
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

// Browser-storage mode keeps the workspace in localStorage, so the workspace page
// needs a project to render anything but its empty state.
async function seedWorkspace() {
  const page = await browser.newPage();
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
  await page.evaluate((id) => {
    const now = new Date().toISOString();
    window.localStorage.setItem("aomi:project", id);
    window.localStorage.setItem(
      "aomi.workspace.v1.projects",
      JSON.stringify([{ id, name: "UI Check", description: "", stack: "static", model: "bw-swift", createdAt: now, updatedAt: now }]),
    );
    window.localStorage.setItem(
      `aomi.workspace.v1.files.${id}`,
      JSON.stringify([
        { path: "index.html", content: "<h1>ui check</h1>", encoding: "utf8", updatedAt: now },
        { path: "assets/logo.txt", content: "logo", encoding: "utf8", updatedAt: now },
      ]),
    );
    window.localStorage.setItem(`aomi.workspace.v1.messages.${id}`, JSON.stringify([]));
  }, PID);
  await page.close();
}

await seedWorkspace().catch(() => {});

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
    const pixelHex = (() => {
      try {
        return execFileSync("python3", [
          "-c",
          "from PIL import Image;im=Image.open('" + file + "').convert('RGB');print('#%02x%02x%02x' % im.getpixel((3,3)))",
        ], { encoding: "utf8" }).trim();
      } catch {
        return "unknown";
      }
    })();
    report.push({ label, vp, overflow: info.scrollW > info.innerW + 1, ...info, pixelHex, errors: [...new Set(errors)].slice(0, 3), file });
    await page.close();
  }
}
await browser.close();
for (const row of report) {
  console.log(`${row.label}/${row.vp}: overflow=${row.overflow} pixel=${row.pixelHex} bodyBg=${row.bg} scroll=${row.scrollW}/${row.innerW} h1=${row.h1 ? "yes" : "no"}`);
  if (row.errors.length) console.log(`   errors: ${row.errors.join(" ~ ")}`);
}
