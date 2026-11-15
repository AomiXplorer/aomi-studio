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
    <div className="mt-6">
      {loading && !order ? (
        <div className="mt-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          memeriksa pembayaran
        </div>
      ) : !order ? (
        <div className="a-rise rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[14.5px] font-medium text-white/90">Halaman ini tidak bisa dibuka.</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-white/50">{error}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link
              href="/login"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-[#fafafa] px-4 text-[13px] font-semibold text-[#09090b] transition-colors duration-150 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
            >
              Kembali ke login
            </Link>
            <Link
              href="/buy"
              className="inline-flex h-11 items-center rounded-md border border-white/10 px-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/55 transition-colors duration-150 hover:border-white/25 hover:text-white"
            >
              beli akses
            </Link>
          </div>
        </div>
      ) : !paid ? (
        <div className="a-rise rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-[14.5px] font-medium text-white/90">Pembayaran belum terverifikasi.</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-white/50">
            Status order ini masih <span className="font-mono text-white/80">{order.status}</span>. Akun hanya dibuat
            setelah pembayaran benar-benar masuk.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link
              href={`/buy/pay?order=${encodeURIComponent(orderId)}&t=${encodeURIComponent(token)}`}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-[#fafafa] px-4 text-[13px] font-semibold text-[#09090b] transition-colors duration-150 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
            >
              Lihat pembayaran
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-md border border-white/10 px-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/55 transition-colors duration-150 hover:border-white/25 hover:text-white"
            >
              kembali ke login
            </Link>
          </div>
        </div>
      ) : (
        <>
          <span
            className="pay-pop grid size-12 place-items-center rounded-full border border-[#86c9a4]/40 text-[#86c9a4]"
            aria-hidden
          >
            <Check className="size-6" />
          </span>
          <h1 className="a-rise mt-5 text-[28px] font-medium leading-[1.08] tracking-[-0.03em] text-white sm:text-[34px]">
            You&apos;re in.
          </h1>
          <p className="a-rise mt-2.5 max-w-[44ch] text-[13.5px] leading-relaxed text-white/55" style={{ "--i": 1 } as React.CSSProperties}>
            Pembayaran berhasil dan akun Aomi kamu sudah aktif. Password ada di email yang kami kirim ke alamat di
            bawah, bukan di halaman ini.
          </p>

          <dl className="a-rise mt-6 divide-y divide-white/[0.06] rounded-lg border border-white/[0.08] px-4" style={{ "--i": 2 } as React.CSSProperties}>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/55">email tujuan</dt>
              <dd className="max-w-[62%] truncate font-mono text-[12px] text-white/85" title={order.email}>
                {order.email}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/55">username</dt>
              <dd className="font-mono text-[12px] text-white/85">{order.username}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/55">status akun</dt>
              <dd className="font-mono text-[12px] text-[#86c9a4]">{data?.ready ? "aktif" : "sedang disiapkan"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/55">status email</dt>
              <dd className="font-mono text-[12px] text-white/70">
                {order.emailStatus === "sent"
                  ? "terkirim"
                  : order.emailStatus === "failed"
                    ? "gagal, owner bisa kirim ulang"
                    : "menunggu"}
              </dd>
            </div>
          </dl>

          {order.emailStatus === "failed" ? (
            <p className="mt-4 flex items-start gap-2 rounded-md border border-[#e58f8f]/25 bg-[#e58f8f]/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-white/60">
              <Mail className="mt-0.5 size-3.5 shrink-0 text-[#e58f8f]" aria-hidden />
              <span>
                Akun kamu sudah aktif, tapi email kredensial gagal terkirim. Hubungi owner supaya dikirim ulang.
                Password tidak pernah ditampilkan di halaman ini.
              </span>
            </p>
          ) : (
            <p className="mt-4 flex items-start gap-2 font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.14em] text-white/50">
              <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>tidak ketemu? cek folder spam, lalu tandai bukan spam</span>
            </p>
          )}

          <div className="a-rise mt-6 flex flex-wrap items-center gap-3" style={{ "--i": 3 } as React.CSSProperties}>
            <Link
              href="/login"
              className="a-submit inline-flex h-12 items-center justify-center gap-2 bg-[#fafafa] px-5 text-[13.5px] font-semibold tracking-[-0.01em] text-[#09090b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
            >
              Ke halaman login
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <p className="font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.14em] text-white/50">
              order {order.transactionId || order.id}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
