import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await p.goto("http://127.0.0.1:3105/", { waitUntil: "networkidle2" });
await p.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,60));} window.scrollTo(0,0); });
await new Promise(r => setTimeout(r, 1200));
await p.screenshot({ path: "../shots/land-desktop.png" });
await p.screenshot({ path: "../shots/land-desktop-full.png", fullPage: true });

await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto("http://127.0.0.1:3105/", { waitUntil: "networkidle2" });
await p.evaluate(async () => { for (let y=0;y<document.body.scrollHeight;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,60));} window.scrollTo(0,0); });
await new Promise(r => setTimeout(r, 1200));
await p.screenshot({ path: "../shots/land-mobile.png" });
await p.screenshot({ path: "../shots/land-mobile-full.png", fullPage: true });
await b.close();
