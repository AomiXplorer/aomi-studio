import puppeteer from "puppeteer-core";
const BASE = "http://127.0.0.1:3108";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await p.goto(`${BASE}/projects`, { waitUntil: "networkidle2" });
await p.evaluate(() => {
  const now = new Date().toISOString(), id = "p-audit-000001";
  localStorage.setItem("aomi:theme", "light");
  localStorage.setItem("aomi:project", id);
  localStorage.setItem("aomi.workspace.v1.projects", JSON.stringify([{ id, name: "Portfolio programmer", description: "situs", stack: "static", model: "bw-swift", createdAt: now, updatedAt: now }]));
  localStorage.setItem(`aomi.workspace.v1.files.${id}`, JSON.stringify([{ path: "index.html", content: "<h1>x</h1>", encoding: "utf8", updatedAt: now }]));
  localStorage.setItem(`aomi.workspace.v1.messages.${id}`, JSON.stringify([]));
});
for (const path of ["/projects", `/projects/p-audit-000001`, "/settings"]) {
  await p.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1200));
  const out = await p.evaluate(() => {
    const lum = (rgb) => { const [r,g,b]=rgb.map(v=>{const c=v/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4}); return 0.2126*r+0.7152*g+0.0722*b; };
    const parse = (v) => (v.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const chain = (el) => { const parts=[]; let n=el; while(n && parts.length<6){const cs=getComputedStyle(n); parts.push(`${n.tagName.toLowerCase()}.${(n.className||"").toString().split(" ").slice(0,3).join(".")} bg=${cs.backgroundColor} bgImg=${cs.backgroundImage.slice(0,30)} op=${cs.opacity}`); n=n.parentElement;} return parts; };
    const rows=[];
    const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen=new Set();
    while(w.nextNode()){
      const t=w.currentNode.textContent?.trim(); if(!t) continue;
      const el=w.currentNode.parentElement; if(!el||seen.has(el)) continue; seen.add(el);
      const r=el.getBoundingClientRect(); if(!r.width||!r.height) continue;
      const cs=getComputedStyle(el); if(cs.visibility==="hidden"||cs.opacity==="0") continue;
      let n=el, bg=null;
      while(n){const c=getComputedStyle(n).backgroundColor; if(c&&c!=="rgba(0, 0, 0, 0)"&&c!=="transparent"){bg=c;break;} n=n.parentElement;}
      const [l1,l2]=[lum(parse(cs.color)), lum(parse(bg||"rgb(255,255,255)"))].sort((a,b)=>b-a);
      const ratio=(l1+0.05)/(l2+0.05);
      if(ratio<4.5) rows.push({text:t.slice(0,30), ratio:+ratio.toFixed(2), color:cs.color, chain:chain(el)});
    }
    return rows.slice(0,3);
  });
  console.log(`### ${path}`);
  for (const row of out) {
    console.log(` ${row.ratio} "${row.text}" color=${row.color}`);
    row.chain.forEach((c) => console.log(`    ${c}`));
  }
}
await b.close();
