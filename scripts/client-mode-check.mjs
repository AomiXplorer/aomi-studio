// End-to-end check for client storage mode: create a project through the UI,
// let the agent write a file, then reload and confirm the workspace survived.
// Usage: node scripts/client-mode-check.mjs [baseUrl]
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || process.env.AOMI_BASE || "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";

const log = (step, detail = "") => console.log(`${step}${detail ? `: ${detail}` : ""}`);
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text().slice(0, 160)}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/chat")) return;
    if (response.status() >= 400) errors.push(`chat ${response.status()}`);
    log("   chat response", String(response.status()));
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle2" });

  log("1. create project through the UI");
  await page.click('[aria-label="Project baru"]');
  await page.waitForSelector('input[placeholder="Portfolio programmer"]', { timeout: 15000 });
  await page.type('input[placeholder="Portfolio programmer"]', "Client Mode Check");
  await page.keyboard.press("Enter");

  const composer = 'textarea[aria-label="Pesan untuk Aomi"]';
  await page.waitForSelector(composer, { timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelector('textarea[aria-label="Pesan untuk Aomi"]')?.placeholder?.includes("Client Mode Check") === true,
    { timeout: 20000 },
  );
  log("   project active");

  log("2. ask the agent to write a file");
  await page.type(composer, "Buat file catatan.txt berisi dua kalimat sapaan singkat.");
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((element) => element.textContent?.trim().startsWith("Kirim"));
    if (!button) return false;
    button.click();
    return true;
  });
  if (!clicked) fail("the send button was not found");
  log("   message submitted");

  await page.waitForFunction(
    () => {
      const keys = Object.keys(window.localStorage).filter((key) => key.startsWith("aomi.workspace.v1.files."));
      return keys.some((key) => (window.localStorage.getItem(key) || "").includes("catatan.txt"));
    },
    { timeout: 120000, polling: 1000 },
  );

  const stored = await page.evaluate(() => {
    const projectId = window.localStorage.getItem("aomi:project");
    const files = JSON.parse(window.localStorage.getItem(`aomi.workspace.v1.files.${projectId}`) || "[]");
    const messages = JSON.parse(window.localStorage.getItem(`aomi.workspace.v1.messages.${projectId}`) || "[]");
    return { projectId, files: files.map((file) => ({ path: file.path, size: file.content.length })), messages: messages.length };
  });
  log("3. workspace in the browser", JSON.stringify(stored.files));
  log("   messages stored", String(stored.messages));
  if (!stored.files.some((file) => file.path === "catatan.txt")) fail("catatan.txt is not in browser storage");
  if (stored.messages < 2) fail("conversation was not stored");

  log("4. reload and check the workspace page");
  await page.goto(`${BASE}/projects/${stored.projectId}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(
    () => document.body.innerText.includes("catatan.txt"),
    { timeout: 30000, polling: 500 },
  );
  log("   file tree shows catatan.txt after reload");

  const text = await page.evaluate(() => document.body.innerText);
  if (text.includes("File tidak ditemukan")) fail("workspace reported a missing file");

  if (errors.length) fail(`page errors: ${errors.join(" | ")}`);
  log("done");
} finally {
  await browser.close();
}
