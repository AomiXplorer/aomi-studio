// Screenshots of the live deployment. Creates a project through the UI (no AI
// tokens spent) so the workspace shot shows real scaffold files.
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "https://aomi-studio.vercel.app";
const OUT = process.argv[3] || "ui-shots/live";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"], protocolTimeout: 300000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/01-chat-light.png` });

await page.click('[aria-label="Project baru"]');
await page.waitForSelector('input[placeholder="Portfolio programmer"]');
await page.type('input[placeholder="Portfolio programmer"]', "Portfolio programmer");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#aomi-composer")?.placeholder?.includes("Portfolio programmer") === true, { timeout: 25000 });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}/02-chat-project.png` });

const projectId = await page.evaluate(() => localStorage.getItem("aomi:project"));
await page.goto(`${BASE}/projects/${projectId}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 2200));
await page.screenshot({ path: `${OUT}/03-workspace.png` });

await page.goto(`${BASE}/projects`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/04-projects.png` });

// dark theme through the sidebar toggle
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 800));
const toggled = await page.evaluate(() => {
  const button = document.querySelector('[aria-label="Aktifkan tema gelap"]');
  if (!button) return false;
  button.click();
  return true;
});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/05-chat-dark.png` });
console.log(`dark toggle found: ${toggled}, theme now ${await page.evaluate(() => localStorage.getItem("aomi:theme"))}`);

const mobile = await browser.newPage();
await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await mobile.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1200));
await mobile.evaluate(() => localStorage.setItem("aomi:theme", "light"));
await mobile.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1200));
await mobile.screenshot({ path: `${OUT}/06-chat-mobile.png` });
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(`mobile horizontal overflow: ${overflow}px`);
console.log("done");
await browser.close();
