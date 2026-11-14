import type { Metadata } from "next";
import { BuyShell } from "@/components/buy/BuyShell";
import { SuccessView } from "@/components/buy/SuccessView";

export const metadata: Metadata = {
  title: "Akun siap — Aomi",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[]; t?: string | string[] }>;
}) {
  const params = await searchParams;
  const orderId = typeof params.order === "string" ? params.order : "";
  const token = typeof params.t === "string" ? params.t : "";

  return (
    <BuyShell eyebrow="done" aside={["akun aktif", "kredensial dikirim", "login pakai email username", "ganti password setelah login"]}>
      {orderId && token ? (
        <SuccessView orderId={orderId} token={token} />
      ) : (
        <div className="mt-8 border border-[#27272a] p-5">
          <p className="text-[14px] text-[#fafafa]">Link tidak lengkap.</p>
          <a href="/login" className="mt-4 inline-flex h-10 items-center bg-[#fafafa] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#09090b]">
            Ke halaman login
          </a>
        </div>
      )}
    </BuyShell>
  );
}
