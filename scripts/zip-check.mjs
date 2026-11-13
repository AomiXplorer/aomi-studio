// Verifies the ZIP download from the workspace UI, including the browser-storage
// path where the ZIP is built from files the browser sends. Seeds a workspace in
// localStorage, clicks ZIP, then inspects the downloaded archive.
// Usage: node scripts/zip-check.mjs [baseUrl]
import puppeteer from "puppeteer-core";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const PROJECT_ID = "p-ziptest-0001";
const downloadDir = mkdtempSync(path.join(tmpdir(), "aomi-zip-"));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  const client = await page.createCDPSession();
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });

  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.evaluate((id) => {
    window.localStorage.clear();
    window.localStorage.setItem("aomi:project", id);
    window.localStorage.setItem(
      "aomi.workspace.v1.projects",
      JSON.stringify([
        {
          id,
          name: "Zip Check",
          description: "",
          stack: "static",
          model: "bw-swift",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    );
    window.localStorage.setItem(
      `aomi.workspace.v1.files.${id}`,
      JSON.stringify([
        { path: "index.html", content: "<h1>zip</h1>", encoding: "utf8", updatedAt: new Date().toISOString() },
        { path: "src/note.txt", content: "halo", encoding: "utf8", updatedAt: new Date().toISOString() },
      ]),
    );
    window.localStorage.setItem(`aomi.workspace.v1.messages.${id}`, JSON.stringify([]));
  }, PROJECT_ID);

  await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: "networkidle2", timeout: 60000 });
  // The tree groups src/ under a collapsed folder, so wait for the file count instead.
  await page.waitForFunction(() => /2 file/.test(document.body.innerText), { timeout: 30000, polling: 500 });

  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === "ZIP");
    if (!button) return false;
    button.click();
    return true;
  });
  if (!clicked) throw new Error("ZIP button not found");

  let archive = null;
  for (let attempt = 0; attempt < 40 && !archive; attempt += 1) {
    const entries = readdirSync(downloadDir).filter((name) => name.endsWith(".zip") && !name.endsWith(".crdownload"));
    if (entries.length) archive = path.join(downloadDir, entries[0]);
    else await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!archive) throw new Error("no ZIP file was downloaded");

  const list = execFileSync("python3", ["-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print('\\n'.join(z.namelist()));assert z.testzip() is None", archive], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  const size = readFileSync(archive).length;
  console.log(`zip: ${path.basename(archive)} (${size} bytes)`);
  console.log(`entries: ${list.join(", ")}`);
  if (!list.includes("index.html") || !list.includes("src/note.txt")) throw new Error("zip is missing workspace files");
  console.log("done");
} finally {
  await browser.close();
  rmSync(downloadDir, { recursive: true, force: true });
}
