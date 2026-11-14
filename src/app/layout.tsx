import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const siteUrl = (process.env.AOMI_PUBLIC_URL || "https://vierraapi.my.id").replace(/\/+$/, "");
const shareTitle = "Aomi Studio — AI agent × Astra";
const shareDescription =
  "Tulis permintaan, agent menulis file, menjalankan perintah, dan menyerahkan project yang bisa diunduh.";

export const metadata: Metadata = {
  title: "Aomi — AI Coding Agent",
  description: shareDescription,
  metadataBase: new URL(siteUrl),
  // The app is private: nothing here belongs in a search index. Link previews still work.
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Aomi Studio",
    locale: "id_ID",
    title: shareTitle,
    description: shareDescription,
    images: [
      {
        url: `${siteUrl}/og-banner.jpg`,
        width: 1200,
        height: 630,
        alt: "Aomi Studio — AI agent × Astra",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: shareTitle,
    description: shareDescription,
    images: [`${siteUrl}/og-banner.jpg`],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Runs before paint so the stored theme never flashes the wrong surface.
const themeScript = `(function(){try{var t=localStorage.getItem("aomi:theme");if(t==="dark")document.documentElement.classList.add("dark");}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The proxy issues one nonce per request; the inline theme script carries it so the
  // Content-Security-Policy never has to allow arbitrary inline script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="id" className={`${jakarta.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
