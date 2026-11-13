import puppeteer from "puppeteer-core";

const BASE = process.argv[2];
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });

function lum(rgb) {
  const [r, g, bl] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const ratio = (a, bg) => {
  const [l1, l2] = [lum(a), lum(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

for (const theme of ["light", "dark"]) {
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${BASE}/projects`, { waitUntil: "networkidle2" });
  await p.evaluate((t) => {
    localStorage.setItem("aomi:theme", t);
    const id = "p-audit-000001";
    localStorage.setItem("aomi:project", id);
    localStorage.setItem("aomi.workspace.v1.projects", JSON.stringify([{ id, name: "Portfolio programmer", description: "", stack: "static", model: "bw-swift", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]));
    localStorage.setItem(`aomi.workspace.v1.files.${id}`, JSON.stringify([{ path: "index.html", content: "<h1>x</h1>", encoding: "utf8", updatedAt: new Date().toISOString() }]));
    localStorage.setItem(`aomi.workspace.v1.messages.${id}`, JSON.stringify([]));
  }, theme);
  await p.goto(`${BASE}/chat`, { waitUntil: "networkidle2" });
  await p.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1200));

  const probe = await p.evaluate(() => {
    const bgOf = (el) => {
      let node = el;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        node = node.parentElement;
      }
      return "rgb(255, 255, 255)";
    };
    const text = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { color: cs.color, bg: bgOf(el), size: cs.fontSize, family: cs.fontFamily.split(",")[0] };
    };
    return {
      darkClass: document.documentElement.classList.contains("dark"),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      h1: text("h1"),
      sub: text("h1 + p"),
      chip: text("main button.rounded-xl"),
      sidebarNav: text("aside nav a"),
      recentLabel: text("aside p.uppercase"),
      composer: text("#aomi-composer"),
    };
  });
  console.log(`--- ${theme} | darkClass=${probe.darkClass} body=${probe.bodyBg}`);
  for (const key of ["h1", "sub", "chip", "sidebarNav", "recentLabel", "composer"]) {
    const item = probe[key];
    if (!item) { console.log(`  ${key}: missing`); continue; }
    console.log(`  ${key}: contrast=${ratio(parse(item.color), parse(item.bg)).toFixed(2)} color=${item.color} bg=${item.bg} size=${item.size} font=${item.family}`);
  }
  await p.screenshot({ path: `/tmp/aomi-${theme}-chat.png`, fullPage: false });
  await p.close();
}
await b.close();
