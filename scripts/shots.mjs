// Captures real screenshots of the live app: an actual agent run, not mock data.
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "https://aomi-studio.vercel.app";
const OUT = process.argv[3] || "ui-shots/new";
// The composer re-mounts right after a project is created, so typing needs a
// settle wait and a verification pass instead of a single blind type().
async function fillComposer(page, text) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((r) => setTimeout(r, 900));
    await page.waitForSelector("#aomi-composer", { timeout: 15000 });
    await page.click("#aomi-composer");
    await page.type("#aomi-composer", text, { delay: 12 });
    const length = await page.evaluate(() => document.querySelector("#aomi-composer")?.value?.length || 0);
    if (length > 10) return true;
  }
  return false;
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  protocolTimeout: 600000,
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `${OUT}/chat-empty-light.png` });
console.log("empty state captured");

await page.click('[aria-label="Project baru"]');
await page.waitForSelector('input[placeholder="Portfolio programmer"]');
await page.type('input[placeholder="Portfolio programmer"]', "Portfolio programmer");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#aomi-composer")?.placeholder?.includes("Portfolio programmer") === true, { timeout: 20000 });

const typed = await fillComposer(page, "Buatkan landing page portfolio programmer dengan halaman project dan kontak.");
if (!typed) throw new Error("composer did not accept text");
await page.evaluate(() => document.querySelector('button[aria-label="Kirim pesan"]')?.click());
console.log("prompt submitted");

// wait until the agent has written real files and finished its reply
await page.waitForFunction(
  () => {
    const fileKeys = Object.keys(localStorage).filter((k) => k.startsWith("aomi.workspace.v1.files."));
    const grown = fileKeys.some((key) => {
      try { return (JSON.parse(localStorage.getItem(key) || "[]") || []).length > 11; } catch { return false; }
    });
    const messageKeys = Object.keys(localStorage).filter((k) => k.startsWith("aomi.workspace.v1.messages."));
    const answered = messageKeys.some((key) => {
      try {
        const list = JSON.parse(localStorage.getItem(key) || "[]") || [];
        return list.some((m) => m.role === "assistant" && (m.content || "").length > 120);
      } catch { return false; }
    });
    return grown || answered;
  },
  { timeout: 240000, polling: 1000 },
);
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${OUT}/chat-conversation-light.png` });
console.log("conversation captured");

const projectId = await page.evaluate(() => localStorage.getItem("aomi:project"));

await page.goto(`${BASE}/projects/${projectId}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${OUT}/workspace-light.png` });
console.log("workspace captured");

await page.evaluate(() => localStorage.setItem("aomi:theme", "dark"));
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1800));
await page.screenshot({ path: `${OUT}/chat-conversation-dark.png` });
console.log("dark captured");

const mobile = await browser.newPage();
await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await mobile.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await mobile.evaluate(() => {
  const t = localStorage.getItem("aomi.workspace.v1.projects");
  if (t) localStorage.setItem("aomi.workspace.v1.projects", t);
  localStorage.setItem("aomi:theme", "light");
});
await mobile.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await mobile.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
await mobile.screenshot({ path: `${OUT}/chat-mobile-light.png` });
console.log("mobile captured");

await browser.close();
