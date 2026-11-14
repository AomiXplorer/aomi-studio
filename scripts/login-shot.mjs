import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "https://vierraapi.my.id";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();

await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: "ui-shots/picker/login-desktop.png" });

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: "ui-shots/picker/login-mobile.png" });

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log("mobile overflow", overflow);
await browser.close();
