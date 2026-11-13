// Proves a long build survives the serverless time cap: the client splits the run
// into slices, so the answer and the files must still arrive complete.
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://127.0.0.1:3111";
const PROMPT = process.argv[3] || "Buatkan landing page portfolio programmer dengan halaman project dan kontak.";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"], protocolTimeout: 900000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
let chatRequests = 0;
page.on("request", (request) => {
  if (request.url().includes("/api/chat") && request.method() === "POST") chatRequests += 1;
});
page.on("pageerror", (error) => errors.push(String(error).slice(0, 160)));

await page.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle2" });
await page.click('[aria-label="Project baru"]');
await page.waitForSelector('input[placeholder="Portfolio programmer"]');
await page.type('input[placeholder="Portfolio programmer"]', "Long Run Check");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#aomi-composer")?.placeholder?.includes("Long Run Check") === true, { timeout: 20000 });

const started = Date.now();
let typed = false;
for (let attempt = 0; attempt < 4 && !typed; attempt += 1) {
  await new Promise((r) => setTimeout(r, 900));
  await page.click("#aomi-composer");
  await page.type("#aomi-composer", PROMPT, { delay: 8 });
  typed = (await page.evaluate(() => document.querySelector("#aomi-composer")?.value?.length || 0)) > 20;
}
if (!typed) throw new Error("composer did not accept the prompt");
await page.evaluate(() => document.querySelector('button[aria-label="Kirim pesan"]')?.click());
console.log("prompt submitted");

// The run is finished only when the agent goes idle *and* an answer exists.
await page.waitForFunction(
  () => {
    const stop = document.querySelector('button[aria-label="Hentikan"]');
    if (stop) return false;
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("aomi.workspace.v1.messages."));
    return keys.some((key) => {
      try {
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        const assistant = list.filter((m) => m.role === "assistant");
        return assistant.length > 0 && (assistant[assistant.length - 1].content || "").length > 200;
      } catch {
        return false;
      }
    });
  },
  { timeout: 600000, polling: 2000 },
);

const idle = true;
await new Promise((r) => setTimeout(r, 1500));
const summary = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("aomi.workspace.v1.files."));
  const files = keys.flatMap((key) => (JSON.parse(localStorage.getItem(key) || "[]") || []).map((f) => f.path));
  const messageKeys = Object.keys(localStorage).filter((k) => k.startsWith("aomi.workspace.v1.messages."));
  const messages = messageKeys.flatMap((key) => JSON.parse(localStorage.getItem(key) || "[]") || []);
  const assistant = messages.filter((m) => m.role === "assistant");
  const last = assistant[assistant.length - 1];
  return {
    files,
    assistantMessages: assistant.length,
    lastLength: last?.content?.length ?? 0,
    tail: (last?.content || "").slice(-600),
    status: last?.status,
    visibleErrors: [...document.querySelectorAll('[role="alert"], .text-danger')].map((el) => el.textContent?.trim().slice(0, 200)).filter(Boolean),
    failed: (last?.status || "completed") === "failed",
  };
});

const seconds = Math.round((Date.now() - started) / 1000);
console.log(`finished in ${seconds}s after ${chatRequests} chat request(s)`);
console.log(`files (${summary.files.length}): ${summary.files.join(", ")}`);
console.log(`assistant messages: ${summary.assistantMessages}, last answer ${summary.lastLength} chars, idle=${idle}, failed=${summary.failed}`);
console.log(`status=${summary.status}`);
console.log(`tail: ${summary.tail.replace(/\s+/g, " ")}`);
if (summary.visibleErrors?.length) console.log(`visible errors: ${summary.visibleErrors.join(" | ")}`);
if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(" | ")}`);
console.log(summary.lastLength > 200 && !summary.failed && idle ? "PASS" : "FAIL");
await page.screenshot({ path: "ui-shots/new/long-run.png" });
await browser.close();
