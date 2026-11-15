import type { Metadata } from "next";
import { BuyShell } from "@/components/buy/BuyShell";
import { PurchaseFlow } from "@/components/buy/PurchaseFlow";
import { accessProduct } from "@/lib/payments/catalog";

export const metadata: Metadata = {
  title: "Beli akses — Aomi",
  description: "Beli akses Aomi sekali bayar lewat QRIS. Akun aktif otomatis setelah pembayaran terverifikasi.",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default function BuyPage() {
  const product = accessProduct();
  return (
    <BuyShell
      eyebrow="buy-access"
      aside={["akun aomi aktif", "chat + workspace", "image & audio studio", "kredensial via email", "tanpa langganan"]}
    >
      <PurchaseFlow product={product} />
    </BuyShell>
  );
}
