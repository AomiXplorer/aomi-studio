// Checks the composer's model picker and the removed hint line in a real browser.
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://127.0.0.1:3120";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"], protocolTimeout: 300000 });
const results = [];
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`;
  results.push(line);
  console.log(line);
};

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error).slice(0, 140)));
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));

const hintGone = await page.evaluate(() => !document.body.innerText.includes("Enter mengirim"));
check("hint line removed", hintGone);

const gap = await page.evaluate(() => {
  const box = document.querySelector("#aomi-composer")?.closest(".aomi-composer");
  const rect = box?.getBoundingClientRect();
  return rect ? Math.round(window.innerHeight - rect.bottom) : -1;
});
check("composer sits near the bottom", gap >= 0 && gap <= 40, `gap ${gap}px`);

const chip = 'button[aria-haspopup="listbox"]';
await page.waitForSelector(chip, { timeout: 20000 });
const chipLabel = await page.$eval(chip, (el) => el.textContent?.trim() || "");
await page.click(chip);
await page.waitForSelector('[role="dialog"][aria-label="Pilih model"]');
const optionCount = await page.$$eval('[role="option"]', (els) => els.length);
check("picker opens with options", optionCount > 3, `${optionCount} models, chip "${chipLabel}"`);

const panelBox = await page.$eval('[role="dialog"][aria-label="Pilih model"]', (el) => {
  const r = el.getBoundingClientRect();
  return { width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
});
check("desktop panel floats above the composer", panelBox.bottom < 900 && panelBox.width <= 340, `${panelBox.width}x${panelBox.height}`);

await page.type('input[aria-label="Cari model"]', "flash");
await new Promise((r) => setTimeout(r, 400));
const filtered = await page.$$eval('[role="option"]', (els) => els.map((el) => el.textContent?.trim() || ""));
check("search filters the list", filtered.length > 0 && filtered.length < optionCount, `${filtered.length} rows`);

const target = filtered[0].split(" ")[0];
await page.click('[role="option"]');
await new Promise((r) => setTimeout(r, 500));
const after = await page.evaluate(() => ({
  chip: document.querySelector('button[aria-haspopup="listbox"]')?.textContent?.trim() || "",
  stored: localStorage.getItem("aomi:model"),
  open: Boolean(document.querySelector('[role="dialog"][aria-label="Pilih model"]')),
}));
check("choosing a model closes and persists", !after.open && Boolean(after.stored), `chip "${after.chip}", stored ${after.stored}, clicked ${target}`);

await page.click(chip);
await page.waitForSelector('[role="dialog"][aria-label="Pilih model"]');
await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 300));
check("escape closes the picker", await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Pilih model"]')));

await page.click(chip);
await page.waitForSelector('[role="dialog"][aria-label="Pilih model"]');
await page.mouse.click(1040, 150);
await new Promise((r) => setTimeout(r, 300));
check("outside click closes the picker", await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Pilih model"]')));

const mobile = await browser.newPage();
await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await mobile.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await mobile.waitForSelector(chip, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 600));
await mobile.click(chip);
await mobile.waitForSelector('[role="dialog"][aria-label="Pilih model"]');
const sheet = await mobile.$eval('[role="dialog"][aria-label="Pilih model"]', (el) => {
  const r = el.getBoundingClientRect();
  return { width: Math.round(r.width), bottom: Math.round(r.bottom), top: Math.round(r.top) };
});
check("mobile opens a bottom sheet", sheet.bottom === 844 && sheet.width === 390, `top ${sheet.top}, width ${sheet.width}`);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal overflow on mobile", overflow === 0, `${overflow}px`);
await mobile.screenshot({ path: "ui-shots/picker/mobile-sheet.png" });
await mobile.evaluate(() => document.querySelector(".fixed.inset-0")?.click());
await new Promise((r) => setTimeout(r, 300));
check("mobile backdrop closes", await mobile.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Pilih model"]')));
await mobile.close();

await page.click(chip);
await page.waitForSelector('[role="dialog"][aria-label="Pilih model"]');
await page.screenshot({ path: "ui-shots/picker/desktop-panel.png" });
await page.keyboard.press("Escape");
await page.screenshot({ path: "ui-shots/picker/desktop-composer.png" });

if (errors.length) results.push(`page errors: ${errors.slice(0, 2).join(" | ")}`);
console.log(results.join("\n"));
console.log(results.some((line) => line.startsWith("FAIL")) ? "OVERALL FAIL" : "OVERALL PASS");
await browser.close();
