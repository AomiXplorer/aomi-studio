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
        <div className="a-rise mt-8 rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[14.5px] font-medium text-white/90">Link pembayaran tidak lengkap.</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-white/50">
            Buka halaman pembelian untuk membuat QRIS baru, atau masuk kalau akunmu sudah ada.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <a
              href="/login"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-[#fafafa] px-4 text-[13px] font-semibold text-[#09090b] transition-colors duration-150 hover:bg-white"
            >
              Kembali ke login
            </a>
            <a
              href="/buy"
              className="inline-flex h-11 items-center rounded-md border border-white/10 px-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/55 transition-colors duration-150 hover:border-white/25 hover:text-white"
            >
              halaman pembelian
            </a>
          </div>
        </div>
      )}
    </BuyShell>
  );
}
