import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { toolNames } from "@/lib/agent/tools";
import { accessPriceIdr } from "@/lib/payments/catalog";

const siteUrl = (process.env.AOMI_PUBLIC_URL || "https://vierraapi.my.id").replace(/\/+$/, "");

const title = "Aomi Studio — Meet Aomi, your personal AI workspace";
const description =
  "Build websites, create projects, and bring your ideas to life with Astra, the AI agent inside Aomi Studio.";

/**
 * The public introduction. It is deliberately static: nothing here reads the
 * session, so the page is served from the edge and the only per-visitor detail
 * (a way back into the workspace) is decided in the browser.
 *
 * This is also the only page that asks to be indexed. Everything behind it stays
 * noindex, which the root layout keeps for the rest of the app.
 */
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  keywords: ["Aomi", "AI agent", "AI workspace", "AI website builder", "Aomi Studio"],
  alternates: { canonical: `${siteUrl}/` },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: `${siteUrl}/`,
    siteName: "Aomi Studio",
    locale: "id_ID",
    title,
    description,
    images: [
      {
        url: `${siteUrl}/og-banner.jpg`,
        width: 1200,
        height: 630,
        alt: "Aomi Studio — Meet Aomi, your personal AI workspace.",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${siteUrl}/og-banner.jpg`],
  },
};

export default function Home() {
  const priceLabel = `Rp${accessPriceIdr().toLocaleString("id-ID")}`;
  return <Landing tools={toolNames()} priceLabel={priceLabel} />;
}
