import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { readSiteMeta } from "@/lib/db/settings";

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

/**
 * The title and description are read per request, so the owner can change what a shared
 * link says from the Telegram console without a redeploy.
 */
export async function generateMetadata(): Promise<Metadata> {
  const meta = await readSiteMeta();
  return {
    title: meta.title,
    description: meta.description,
    metadataBase: new URL(siteUrl),
    // The app is private: nothing here belongs in a search index. Link previews still work.
    robots: { index: false, follow: false, nocache: true },
    openGraph: {
      type: "website",
      url: siteUrl,
      siteName: "Aomi Studio",
      locale: "id_ID",
      title: meta.title,
      description: meta.description,
      images: [
        {
          url: `${siteUrl}/og-banner.jpg`,
          width: 1200,
          height: 630,
          alt: meta.title,
          type: "image/jpeg",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [`${siteUrl}/og-banner.jpg`],
    },
  };
}

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
