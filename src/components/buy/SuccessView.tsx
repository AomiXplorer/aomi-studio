"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Mail } from "lucide-react";

interface StatusResponse {
  ok?: boolean;
  order?: {
    id: string;
    email: string;
    username: string;
    status: string;
    provisionStatus: string;
    emailStatus: string;
    payableAmount: number;
    transactionId: string;
  };
  ready?: boolean;
  error?: { message?: string };
}

/**
 * Confirmation only.
 *
 * The password is not on this page and is not in the response this page reads: it exists
 * in the email and in the owner's recovery tools, nowhere else. What is shown is the
 * address it went to, the username, and that the account is active.
 */
export function SuccessView({ orderId, token }: { orderId: string; token: string }) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/purchase/order/${encodeURIComponent(orderId)}?t=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as StatusResponse | null;
      if (!response.ok || !payload?.order) {
        setError(payload?.error?.message || "Data pembelian tidak bisa dibaca.");
      } else {
        setData(payload);
        setError(null);
      }
    } catch {
      setError("Server tidak bisa dihubungi.");
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data?.ready) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [data?.ready, load]);

  const order = data?.order;
  const paid = order?.status === "paid";

  return (
    <div className="sh-enter mt-7" style={{ "--sh-delay": "140ms" } as React.CSSProperties}>
      {loading && !order ? (
        <div className="flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.16em] text-[#8b8b96]">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          memeriksa pembayaran
        </div>
      ) : !order ? (
        <div className="border border-[#27272a] p-5">
          <p className="text-[14px] text-[#fafafa]">Halaman ini tidak bisa dibuka.</p>
          <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-[#8b8b96]">{error}</p>
          <Link href="/buy" className="mt-4 inline-flex h-10 items-center bg-[#fafafa] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#09090b]">
            Kembali ke pembelian
          </Link>
        </div>
      ) : !paid ? (
        <div className="border border-[#27272a] p-5">
          <p className="text-[14px] text-[#fafafa]">Pembayaran belum terverifikasi.</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[#a1a1aa]">
            Status order ini masih <span className="font-mono">{order.status}</span>. Akun hanya dibuat setelah
            pembayaran benar-benar masuk.
          </p>
          <Link
            href={`/buy/pay?order=${encodeURIComponent(orderId)}&t=${encodeURIComponent(token)}`}
            className="mt-4 inline-flex h-10 items-center gap-2 bg-[#fafafa] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#09090b]"
          >
            Lihat pembayaran
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : (
        <>
          <span className="pay-pop grid size-12 place-items-center rounded-full border border-[#86c9a4]/40 text-[#86c9a4]">
            <Check className="size-6" aria-hidden />
          </span>
          <h1 className="mt-5 text-[28px] font-medium leading-[1.12] tracking-[-0.03em] text-[#fafafa] sm:text-[34px]">
            You&apos;re In! Welcome to Aomi.
          </h1>
          <p className="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-[#a1a1aa]">
            Pembayaran berhasil! Akun Aomi kamu sudah siap. Cek email untuk mendapatkan informasi login.
          </p>

          <dl className="mt-7 divide-y divide-[#1c1c20] border-y border-[#1c1c20]">
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8b8b96]">email tujuan</dt>
              <dd className="max-w-[62%] truncate font-mono text-[12.5px] text-[#fafafa]" title={order.email}>
                {order.email}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8b8b96]">username</dt>
              <dd className="font-mono text-[12.5px] text-[#fafafa]">{order.username}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8b8b96]">status akun</dt>
              <dd className="font-mono text-[12.5px] text-[#86c9a4]">
                {data?.ready ? "aktif" : "sedang disiapkan"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8b8b96]">status email</dt>
              <dd className="font-mono text-[12.5px] text-[#d4d4d8]">
                {order.emailStatus === "sent" ? "terkirim" : order.emailStatus === "failed" ? "gagal, owner bisa kirim ulang" : "menunggu"}
              </dd>
            </div>
          </dl>

          {order.emailStatus === "failed" ? (
            <p className="mt-4 flex items-start gap-2 border-l border-[#3a3a3f] pl-3 font-mono text-[11px] leading-relaxed text-[#a1a1aa]">
              <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Akun kamu sudah aktif, tapi email kredensial gagal terkirim. Hubungi owner lewat WhatsApp supaya
                dikirim ulang. Password tidak pernah ditampilkan di halaman ini.
              </span>
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="sh-submit inline-flex h-12 items-center justify-between gap-6 bg-[#fafafa] px-5 font-mono text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#09090b] transition-colors hover:bg-[#d4d4d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
            >
              Back to Login
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
            <p className="font-mono text-[11px] leading-relaxed text-[#8b8b96]">
              password hanya ada di email ·{" "}
              <span className="text-[#d4d4d8]">{order.transactionId || order.id}</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
