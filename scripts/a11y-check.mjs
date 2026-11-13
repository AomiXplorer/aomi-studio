// Walks every visible text node on each page in both themes and reports the
// lowest contrast ratios, so an unreadable label can't slip through.
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://127.0.0.1:3106";
const PID = process.argv[3] || "p-audit-000001";
const PAGES = [["chat", "/chat"], ["projects", "/projects"], ["workspace", `/projects/${PID}`], ["image", "/studio/image"], ["audio", "/studio/audio"], ["settings", "/settings"]];

const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
let failures = 0;

for (const theme of ["light", "dark"]) {
  for (const [label, path] of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE}/projects`, { waitUntil: "networkidle2" });
    await page.evaluate((t, id) => {
      const now = new Date().toISOString();
      localStorage.setItem("aomi:theme", t);
      localStorage.setItem("aomi:project", id);
      localStorage.setItem("aomi.workspace.v1.projects", JSON.stringify([{ id, name: "Portfolio programmer", description: "", stack: "static", model: "bw-swift", createdAt: now, updatedAt: now }]));
      localStorage.setItem(`aomi.workspace.v1.files.${id}`, JSON.stringify([{ path: "index.html", content: "<h1>x</h1>", encoding: "utf8", updatedAt: now }]));
      localStorage.setItem(`aomi.workspace.v1.messages.${id}`, JSON.stringify([]));
    }, theme, PID);
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 900));

    const rows = await page.evaluate(() => {
      // Chrome reports Tailwind tints as oklab()/color(srgb ...) with alpha, so the
      // audit converts those to sRGB and composites them over the parent surface.
      const toRgb = (value) => {
        const nums = (value.match(/-?[\d.]+/g) || []).map(Number);
        if (value.startsWith("oklab")) {
          const [l, a, b] = [nums[0] ?? 1, nums[1] ?? 0, nums[2] ?? 0];
          const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
          const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
          const s_ = l - 0.0894841775 * a - 1.291485548 * b;
          const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3];
          const lin = [
            4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
            -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
            -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
          ];
          const rgb = lin.map((c) => {
            const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
            return Math.round(Math.max(0, Math.min(1, v)) * 255);
          });
          return { rgb, alpha: nums[3] ?? 1 };
        }
        if (value.startsWith("color(srgb")) {
          return { rgb: nums.slice(0, 3).map((n) => Math.round(Math.max(0, Math.min(1, n)) * 255)), alpha: nums[3] ?? 1 };
        }
        return { rgb: nums.slice(0, 3), alpha: value.startsWith("rgba") ? (nums[3] ?? 1) : 1 };
      };

      const blend = (top, bottom, alpha) => top.map((channel, index) => Math.round(channel * alpha + bottom[index] * (1 - alpha)));

      const surfaceOf = (el) => {
        const layers = [];
        let node = el;
        while (node) {
          const { rgb, alpha } = toRgb(getComputedStyle(node).backgroundColor || "rgba(0, 0, 0, 0)");
          if (alpha > 0) layers.push({ rgb, alpha });
          node = node.parentElement;
        }
        let base = [255, 255, 255];
        for (let index = layers.length - 1; index >= 0; index -= 1) {
          base = blend(layers[index].rgb, base, layers[index].alpha);
        }
        return base;
      };

      const lum = (rgb) => {
        const [r, g, b] = rgb.map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };

      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent?.trim();
        if (!text) continue;
        const el = walker.currentNode.parentElement;
        if (!el || seen.has(el)) continue;
        seen.add(el);
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.opacity === "0") continue;
        const size = parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const large = size >= 24 || (size >= 18.66 && bold);
        const surface = surfaceOf(el);
        const [l1, l2] = [lum(toRgb(cs.color).rgb), lum(surface)].sort((a, b) => b - a);
        out.push({ text: text.slice(0, 40), ratio: (l1 + 0.05) / (l2 + 0.05), size, large, color: cs.color });
      }
      return out;
    });

    const bad = rows.filter((row) => row.ratio < (row.large ? 3 : 4.5)).sort((a, b) => a.ratio - b.ratio);
    if (bad.length) failures += bad.length;
    console.log(`${theme}/${label}: ${bad.length ? `${bad.length} below AA` : "all text passes AA"}`);
    for (const row of bad.slice(0, 5)) {
      console.log(`   ${row.ratio.toFixed(2)} ${row.size}px ${row.color} "${row.text}"`);
    }
    await page.close();
  }
}

await browser.close();
console.log(failures ? `${failures} text nodes below AA` : "done");
