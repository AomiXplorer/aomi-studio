import type { Metadata } from "next";
import { BuyShell } from "@/components/buy/BuyShell";
import { PaymentView } from "@/components/buy/PaymentView";

export const metadata: Metadata = {
  title: "Pembayaran — Aomi",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[]; t?: string | string[] }>;
}) {
  const params = await searchParams;
  const orderId = typeof params.order === "string" ? params.order : "";
  const token = typeof params.t === "string" ? params.t : "";

  return (
    <BuyShell eyebrow="pay" aside={["scan qris", "bayar tepat nominal", "akun aktif otomatis", "kredensial via email"]}>
      {orderId && token ? (
        <PaymentView orderId={orderId} token={token} />
      ) : (
        <div className="mt-8 border border-[#27272a] p-5">
          <p className="text-[14px] text-[#fafafa]">Link pembayaran tidak lengkap.</p>
          <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-[#8b8b96]">
            Buka halaman pembelian untuk membuat QRIS baru.
          </p>
          <a
            href="/buy"
            className="mt-4 inline-flex h-10 items-center bg-[#fafafa] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#09090b]"
          >
            Ke halaman pembelian
          </a>
        </div>
      )}
    </BuyShell>
  );
}
