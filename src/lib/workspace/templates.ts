/** Real, minimal-but-runnable scaffolds used by create_project / generate_project. */

export type TemplateId = "blank" | "static" | "nextjs" | "react-vite" | "node-cli";

export const TEMPLATES: { id: TemplateId; label: string; description: string; stack: string }[] = [
  { id: "blank", label: "Blank", description: "Workspace kosong, hanya README.", stack: "blank" },
  { id: "static", label: "Static site", description: "HTML, CSS dan JavaScript tanpa build step.", stack: "html" },
  { id: "nextjs", label: "Next.js", description: "Next.js App Router + TypeScript + Tailwind.", stack: "nextjs" },
  { id: "react-vite", label: "React + Vite", description: "React 19 + Vite + TypeScript.", stack: "react-vite" },
  { id: "node-cli", label: "Node CLI", description: "TypeScript CLI dengan tsx.", stack: "node" },
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "app";

function readme(name: string, lines: string[]) {
  return [`# ${name}`, "", ...lines, ""].join("\n");
}

export function scaffold(template: TemplateId, name: string): Record<string, string> {
  const packageName = slug(name);

  if (template === "static") {
    return {
      "index.html": `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main>
      <h1>${name}</h1>
      <p>Halaman ini dibuat oleh Aomi. Edit <code>index.html</code> untuk mulai.</p>
      <button id="counter" type="button">Diklik 0 kali</button>
    </main>
    <script src="/app.js"></script>
  </body>
</html>
`,
      "styles.css": `:root {
  color-scheme: light dark;
  --ink: #18181b;
  --paper: #fafafa;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: ui-sans-serif, system-ui, sans-serif;
  background: var(--paper);
  color: var(--ink);
}

main {
  max-width: 38rem;
  padding: 2rem;
}

button {
  font: inherit;
  padding: 0.5rem 1rem;
  border: 1px solid currentColor;
  border-radius: 0.5rem;
  background: transparent;
  cursor: pointer;
}

button:hover {
  background: var(--ink);
  color: var(--paper);
}
`,
      "app.js": `const button = document.getElementById("counter");
let count = 0;

button?.addEventListener("click", () => {
  count += 1;
  button.textContent = \`Diklik \${count} kali\`;
});
`,
      "README.md": readme(name, ["Situs statis tanpa build step.", "", "Jalankan dengan `npx serve .` atau buka `index.html` langsung."]),
    };
  }

  if (template === "nextjs") {
    return {
      "package.json": JSON.stringify(
        {
          name: packageName,
          version: "0.1.0",
          private: true,
          scripts: { dev: "next dev", build: "next build", start: "next start" },
          dependencies: { next: "^16.4.6", react: "^19.3.1", "react-dom": "^19.3.1" },
          devDependencies: {
            "@tailwindcss/postcss": "^4.3.5",
            "@types/node": "^24.7.0",
            "@types/react": "^19.2.0",
            "@types/react-dom": "^19.2.0",
            postcss: "^8.5.6",
            tailwindcss: "^4.3.5",
            typescript: "^5.9.3",
          },
        },
        null,
        2,
      ),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["dom", "dom.iterable", "esnext"],
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            jsx: "preserve",
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./src/*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        },
        null,
        2,
      ),
      "next.config.ts": `import type { NextConfig } from "next";

const config: NextConfig = { reactStrictMode: true };

export default config;
`,
      "postcss.config.mjs": `export default { plugins: { "@tailwindcss/postcss": {} } };
`,
      "src/app/layout.tsx": `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "${name}", description: "Dibuat dengan Aomi" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
`,
      "src/app/page.tsx": `export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">${name}</h1>
      <p className="mt-4 text-neutral-400">
        Scaffold Next.js siap dipakai. Mulai dari <code>src/app/page.tsx</code>.
      </p>
    </main>
  );
}
`,
      "src/app/globals.css": `@import "tailwindcss";

:root {
  color-scheme: dark;
}

body {
  background: #09090b;
  color: #fafafa;
  -webkit-font-smoothing: antialiased;
}
`,
      ".gitignore": "node_modules\n.next\n.env*\n",
      ".env.example": "# Isi variabel lingkungan di sini\n",
      "README.md": readme(name, ["Scaffold Next.js App Router + TypeScript.", "", "```bash", "npm install", "npm run dev", "```"]),
    };
  }

  if (template === "react-vite") {
    return {
      "package.json": JSON.stringify(
        {
          name: packageName,
          private: true,
          version: "0.1.0",
          type: "module",
          scripts: { dev: "vite", build: "tsc -b && vite build", preview: "vite preview" },
          dependencies: { react: "^19.3.1", "react-dom": "^19.3.1" },
          devDependencies: {
            "@types/react": "^19.2.0",
            "@types/react-dom": "^19.2.0",
            "@vitejs/plugin-react": "^5.0.4",
            typescript: "^5.9.3",
            vite: "^7.1.9",
          },
        },
        null,
        2,
      ),
      "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`,
      "tsconfig.json": JSON.stringify(
        { compilerOptions: { target: "ES2022", lib: ["dom", "esnext"], jsx: "react-jsx", strict: true, moduleResolution: "bundler", module: "esnext", noEmit: true, skipLibCheck: true }, include: ["src"] },
        null,
        2,
      ),
      "index.html": `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
      "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
      "src/App.tsx": `export default function App() {
  return (
    <main className="shell">
      <h1>${name}</h1>
      <p>Scaffold React + Vite siap dikembangkan.</p>
    </main>
  );
}
`,
      "src/styles.css": `:root { color-scheme: dark; }
body { margin: 0; background: #09090b; color: #fafafa; font-family: ui-sans-serif, system-ui, sans-serif; }
.shell { max-width: 40rem; margin: 0 auto; padding: 6rem 1.5rem; }
`,
      ".gitignore": "node_modules\ndist\n.env*\n",
      "README.md": readme(name, ["React 19 + Vite + TypeScript.", "", "```bash", "npm install", "npm run dev", "```"]),
    };
  }

  if (template === "node-cli") {
    return {
      "package.json": JSON.stringify(
        {
          name: packageName,
          version: "0.1.0",
          type: "module",
          bin: { [packageName]: "dist/index.js" },
          scripts: { dev: "tsx src/index.ts", build: "tsc" },
          devDependencies: { "@types/node": "^24.7.0", tsx: "^4.20.6", typescript: "^5.9.3" },
        },
        null,
        2,
      ),
      "tsconfig.json": JSON.stringify(
        { compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", outDir: "dist", strict: true, skipLibCheck: true }, include: ["src"] },
        null,
        2,
      ),
      "src/index.ts": `#!/usr/bin/env node
const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log("${name} — CLI buatan Aomi");
  process.exit(0);
}

console.log("Halo dari ${name}. Argumen:", args.length ? args.join(" ") : "(kosong)");
`,
      ".gitignore": "node_modules\ndist\n",
      "README.md": readme(name, ["CLI TypeScript minimal.", "", "```bash", "npm install", "npm run dev -- --help", "```"]),
    };
  }

  return {
    "README.md": readme(name, ["Workspace kosong.", "", "Minta Aomi membuat file pertama untuk memulai."]),
  };
}
