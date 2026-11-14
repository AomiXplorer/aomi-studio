/**
 * Builds Aomi's shared brand assets from the supplied character artwork.
 *
 * Outputs two files, both small enough for WhatsApp previews and for the login page:
 *   public/astra.webp    the artwork itself, compressed for the UI
 *   public/og-banner.jpg the 1200x630 share card WhatsApp renders when the link is sent
 *
 * Run: node scripts/make-brand-assets.mjs <source-image>
 */
import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/make-brand-assets.mjs <source-image>");
  process.exit(1);
}

await mkdir("public", { recursive: true });

const meta = await sharp(source).metadata();

// 1. Artwork for the interface: 900px wide, quality 72 keeps the grain without the weight.
await sharp(source)
  .rotate()
  .resize({ width: Math.min(900, meta.width ?? 900), withoutEnlargement: true })
  .webp({ quality: 72, effort: 5 })
  .toFile("public/astra.webp");

// 2. Share card. The art sits in the right 520px and fades into the canvas so the
//    text side never fights the drawing.
const WIDTH = 1200;
const HEIGHT = 630;
const ART_W = 520;

const art = await sharp(source)
  .rotate()
  .resize(ART_W, HEIGHT, { fit: "cover", position: "attention" })
  .grayscale()
  .linear(1.22, 8)
  .toBuffer();

const fade = Buffer.from(
  `<svg width="${ART_W}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
     <defs>
       <linearGradient id="f" x1="0" y1="0" x2="1" y2="0">
         <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
         <stop offset="24%" stop-color="#fff" stop-opacity="0.55"/>
         <stop offset="62%" stop-color="#fff" stop-opacity="1"/>
         <stop offset="100%" stop-color="#fff" stop-opacity="1"/>
       </linearGradient>
     </defs>
     <rect width="100%" height="100%" fill="url(#f)"/>
   </svg>`,
);

const artMasked = await sharp(art)
  .ensureAlpha()
  .composite([{ input: fade, blend: "dest-in" }])
  .png()
  .toBuffer();

const text = Buffer.from(
  `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
     <g font-family="DejaVu Sans Mono, monospace" fill="#8b8b96">
       <text x="72" y="92" font-size="15" letter-spacing="4.2">AOMI STUDIO</text>
     </g>
     <g font-family="DejaVu Sans, sans-serif" fill="#fafafa">
       <text x="70" y="248" font-size="112" font-weight="700" letter-spacing="-3">AOMI</text>
     </g>
     <g font-family="DejaVu Sans Mono, monospace" fill="#a1a1aa">
       <text x="72" y="298" font-size="19" letter-spacing="6.4">AI AGENT X ASTRA</text>
     </g>
     <rect x="72" y="344" width="470" height="1" fill="#27272a"/>
     <g font-family="DejaVu Sans, sans-serif" fill="#a1a1aa" font-size="21">
       <text x="72" y="402">Tulis permintaan. Agent menulis file,</text>
       <text x="72" y="436">menjalankan perintah, menyerahkan project.</text>
     </g>
     <g font-family="DejaVu Sans Mono, monospace">
       <text x="72" y="548" font-size="17" fill="#fafafa" letter-spacing="1">vierraapi.my.id</text>
       <text x="72" y="584" font-size="12" fill="#6b6b76" letter-spacing="3.4">PRIVATE WORKSPACE</text>
     </g>
   </svg>`,
);

await sharp({
  create: { width: WIDTH, height: HEIGHT, channels: 4, background: "#09090b" },
})
  .composite([
    { input: artMasked, left: WIDTH - ART_W, top: 0 },
    { input: text, left: 0, top: 0 },
  ])
  .jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: "4:2:0" })
  .toFile("public/og-banner.jpg");

for (const file of ["public/astra.webp", "public/og-banner.jpg"]) {
  const info = await stat(file);
  const dims = await sharp(file).metadata();
  console.log(`${file}  ${dims.width}x${dims.height}  ${(info.size / 1024).toFixed(1)} KB`);
}
