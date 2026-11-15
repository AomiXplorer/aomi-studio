"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Copy, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { rupiah } from "./BuyShell";

interface OrderView {
  id: string;
  product: string;
  email: string;
  username: string;
  requestedAmount: number;
  payableAmount: number;
  fee: number;
  uniqueCode: number;
  status: "pending" | "paid" | "expired" | "failed" | "cancelled";
  provisionStatus: "none" | "pending" | "done" | "failed";
  emailStatus: "none" | "pending" | "sent" | "failed";
  qrImage: string;
  transactionId: string;
  expiresAt: string;
  paidAt: string;
  createdAt: string;
  settledBy: string;
}

interface StatusResponse {
  ok?: boolean;
  order?: OrderView;
  ready?: boolean;
  account?: { username: string; email: string; status: string } | null;
  error?: { message?: string };
}

const POLL_MS = 5_000;
/** How long a finished (cancelled or expired) screen stays up before the room closes. */
const EXIT_MS = 4_000;

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The payment screen.
 *
 * The QR is the provider's own image, the amount is what the provider asked for, and the
 * status only changes when the provider says so. Polling is a fallback for a late webhook,
 * never a way to "confirm" a payment locally.
 *
 * A dead order never leaves someone staring at a stale QR: cancelling, or letting the QR
 * lapse, closes the shop and walks them back to the sign-in page with one line explaining
 * what happened.
 */
export function PaymentView({ orderId, token }: { orderId: string; token: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [leaving, setLeaving] = useState<null | { to: "cancelled" | "expired"; in: number }>(null);
  const [now, setNow] = useState(() => Date.now());
  const stopped = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const query = useMemo(() => `t=${encodeURIComponent(token)}`, [token]);

  const merge = useCallback((payload: StatusResponse) => {
    if (payload.order) setOrder(payload.order);
    if (payload.ready) setReady(true);
  }, []);

  const fetchStatus = useCallback(
    async (manual = false) => {
      if (manual) setChecking(true);
      try {
        const response = await fetch(`/api/purchase/order/${encodeURIComponent(orderId)}?${query}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as StatusResponse | null;
        if (!response.ok || !payload?.order) {
          setError(payload?.error?.message || "Status pembayaran tidak bisa dibaca.");
          return;
        }
        merge(payload);
        setError(null);
      } catch {
        if (manual) setError("Server tidak bisa dihubungi. Coba lagi.");
      } finally {
        if (manual) setChecking(false);
        setLoading(false);
      }
    },
    [merge, orderId, query],
  );

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // One timer for the countdown, one for the poll: both stop the moment the order settles.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!order) return;
    const settled = order.status !== "pending";
    if (settled || ready) {
      stopped.current = true;
      return;
    }
    stopped.current = false;
    const timer = setInterval(() => {
      if (!stopped.current) void fetchStatus();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchStatus, order, ready]);

  // A verified payment with an account ready hands over to the success page.
  useEffect(() => {
    if (order?.status === "paid" && ready) {
      router.replace(`/buy/success?order=${encodeURIComponent(orderId)}&${query}`);
    }
  }, [order, orderId, query, ready, router]);

  const remaining = order?.expiresAt ? Date.parse(order.expiresAt) - now : 0;
  const expired = Boolean(order) && order?.status === "pending" && remaining <= 0;
  const dead = Boolean(order) && (order?.status === "expired" || order?.status === "cancelled" || expired);

  /** Counts down a dead order out of the shop and back to the sign-in page. */
  const exitTo = useCallback(
    (to: "cancelled" | "expired") => {
      if (leaving || exitTimer.current) return;
      setLeaving({ to, in: Math.round(EXIT_MS / 1000) });
      exitTimer.current = setInterval(() => {
        setLeaving((current) => {
          if (!current) return current;
          const next = current.in - 1;
          if (next <= 0) {
            if (exitTimer.current) clearInterval(exitTimer.current);
            exitTimer.current = null;
            router.replace(`/login?status=${to}`);
            return null;
          }
          return { ...current, in: next };
        });
      }, 1000);
    },
    [leaving, router],
  );

  useEffect(() => () => {
    if (exitTimer.current) clearInterval(exitTimer.current);
  }, []);

  // A lapsed QR closes itself, the same way a cancelled one does.
  useEffect(() => {
    if (dead) exitTo("expired");
  }, [dead, exitTo]);

  async function copyAmount() {
    if (!order) return;
    const value = String(order.payableAmount);
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`Nominal ${rupiah(order.payableAmount)} disalin.`);
    } catch {
      setNotice(`Nominal: ${rupiah(order.payableAmount)}`);
    }
  }

  async function cancel() {
    if (cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const response = await fetch(`/api/purchase/order/${encodeURIComponent(orderId)}/cancel?${query}`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as StatusResponse | null;
      if (!response.ok) {
        setError(payload?.error?.message || "Tidak bisa membatalkan pembayaran ini.");
        return;
      }
      merge(payload || {});
      if (payload?.order) setOrder(payload.order);
      setNotice("Pembayaran dibatalkan. Tidak ada biaya yang dikenakan.");
      exitTo("cancelled");
    } catch {
      setError("Server tidak bisa dihubungi. Coba lagi.");
    } finally {
      setCancelling(false);
    }
  }

  if (loading && !order) {
    return (
      <div className="mt-10 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        memuat qris
      </div>
    );
  }

  if (!order) {
    return (
      <div className="a-rise mt-8 rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
        <p className="text-[14.5px] font-medium text-white/90">Pembayaran ini tidak bisa dibuka.</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/50">
          {error || "Link pembayaran tidak valid atau sudah diganti dengan yang baru."}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Link
            href="/login"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-[#fafafa] px-4 text-[13px] font-semibold text-[#09090b] transition-colors duration-150 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
          >
            Kembali ke login
          </Link>
          <Link
            href="/buy"
            className="inline-flex h-11 items-center rounded-md border border-white/10 px-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/55 transition-colors duration-150 hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            mulai pembelian baru
          </Link>
        </div>
      </div>
    );
  }

  const payable = order.payableAmount || order.requestedAmount;
  const paid = order.status === "paid";
  const statusLabel = paid
    ? ready
      ? "Pembayaran terverifikasi"
      : "Pembayaran diterima, menyiapkan akun"
    : order.status === "cancelled"
      ? "Dibatalkan"
      : order.status === "expired" || expired
        ? "QRIS kedaluwarsa"
        : order.status === "failed"
          ? "Pembayaran gagal"
          : "Menunggu pembayaran";
  const tone = paid ? "#86c9a4" : dead ? "#e58f8f" : "#fafafa";

  return (
    <div className="mt-6">
      <div className="a-rise flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[9.5px] uppercase tracking-[0.16em]">
        <span className="flex items-center gap-2 text-white/70">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${dead ? "" : "animate-pulse"}`}
            style={{ background: tone, boxShadow: `0 0 8px ${tone}66` }}
          />
          {statusLabel}
        </span>
        <span aria-hidden className="h-3 w-px bg-white/10" />
        <span className="tabular-nums text-white/55">
          {order.status === "pending" && !expired ? `sisa ${clock(remaining)}` : order.transactionId || order.id}
        </span>
      </div>

      <div className="a-rise mt-4" style={{ "--i": 1 } as React.CSSProperties}>
        <h1 className="text-[26px] font-medium leading-[1.1] tracking-[-0.03em] text-white sm:text-[32px]">
          {paid ? "Pembayaran diterima." : dead ? "Pesanan ini sudah ditutup." : "Scan untuk menyelesaikan."}
        </h1>
        <p className="mt-2.5 max-w-[46ch] text-[13px] leading-relaxed text-white/55">
          {paid
            ? "Akun kamu sedang disiapkan. Halaman ini akan berpindah sendiri begitu kredensial terkirim."
            : dead
              ? leaving
                ? `Kembali ke halaman login dalam ${leaving.in} detik.`
                : "QRIS ini tidak bisa dibayar lagi. Kembali ke login untuk mulai dari awal."
              : "Satu QRIS, satu kali bayar. Nominal harus sama persis supaya pembayaran terbaca otomatis."}
        </p>
      </div>

      <div className="a-rise mt-6 grid gap-5 sm:grid-cols-[minmax(0,232px)_minmax(0,1fr)]" style={{ "--i": 2 } as React.CSSProperties}>
        {/* The QR keeps a white bed and four corner ticks: it must read as a scanner target,
            never as part of the dark interface around it. */}
        <div className="relative mx-auto w-full max-w-[232px] self-start rounded-lg bg-white p-3">
          <span aria-hidden className="pointer-events-none absolute left-1 top-1 size-2.5 border-l border-t border-[#09090b]/25" />
          <span aria-hidden className="pointer-events-none absolute right-1 top-1 size-2.5 border-r border-t border-[#09090b]/25" />
          <span aria-hidden className="pointer-events-none absolute bottom-1 left-1 size-2.5 border-b border-l border-[#09090b]/25" />
          <span aria-hidden className="pointer-events-none absolute bottom-1 right-1 size-2.5 border-b border-r border-[#09090b]/25" />
          {order.qrImage ? (
            <img src={order.qrImage} alt="QRIS pembayaran Aomi" width={208} height={208} className="pay-fade block w-full rounded-sm" />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-sm bg-[#f4f4f6] font-mono text-[9px] uppercase tracking-[0.14em] text-[#52525b]">
              qris tidak tersedia
            </div>
          )}
          <p className="mt-2 text-center font-mono text-[8.5px] uppercase tracking-[0.2em] text-[#71717a]">
            qris · austinpay
          </p>
        </div>

        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-white/55">nominal tepat</p>
          <div className="mt-1.5 flex items-baseline gap-3">
            <p className="font-mono text-[32px] leading-none tabular-nums tracking-[-0.03em] text-white sm:text-[38px]">
              {rupiah(payable)}
            </p>
            <button
              type="button"
              onClick={() => void copyAmount()}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/55 transition-colors duration-150 hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <Copy className="size-3" aria-hidden />
              salin
            </button>
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-white/50">
            {order.requestedAmount === payable
              ? "sudah termasuk biaya layanan"
              : `${rupiah(order.requestedAmount)} + biaya qris ${rupiah(Math.max(0, payable - order.requestedAmount))}`}
          </p>

          <dl className="mt-5 divide-y divide-white/[0.06] border-y border-white/[0.06] text-[12px]">
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-white/55">username</dt>
              <dd className="max-w-[62%] truncate font-mono text-white/85">{order.username}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-white/55">email</dt>
              <dd className="max-w-[62%] truncate font-mono text-white/85" title={order.email}>
                {order.email}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-white/55">order</dt>
              <dd className="max-w-[62%] truncate font-mono text-white/60">{order.id}</dd>
            </div>
          </dl>

          {dead ? (
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-[#fafafa] px-4 text-[13px] font-semibold text-[#09090b] transition-colors duration-150 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
              >
                Kembali ke login
              </Link>
              <Link
                href="/buy"
                className="inline-flex h-11 items-center rounded-md border border-white/10 px-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/55 transition-colors duration-150 hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                beli lagi
              </Link>
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => void fetchStatus(true)}
                disabled={checking}
                className="a-submit flex h-12 w-full items-center justify-center gap-2 bg-[#fafafa] text-[13.5px] font-semibold tracking-[-0.01em] text-[#09090b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a] disabled:cursor-wait disabled:bg-white/10 disabled:text-white/55"
              >
                {checking ? (
                  <>
                    <span className="a-spin" aria-hidden />
                    Memeriksa pembayaran
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-4" aria-hidden />
                    Cek status pembayaran
                  </>
                )}
              </button>
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-white/50">
                  dicek otomatis tiap 5 detik
                </p>
                <button
                  type="button"
                  onClick={() => void cancel()}
                  disabled={cancelling || order.status !== "pending"}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/50 transition-colors duration-150 hover:text-[#e58f8f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <X className="size-3.5" aria-hidden />
                  {cancelling ? "membatalkan" : "batalkan & kembali ke login"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div aria-live="polite" className="mt-5 min-h-[36px]">
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-[12px] leading-relaxed text-[#e58f8f]">
            <span aria-hidden className="mt-px font-mono">
              !
            </span>
            <span>{error}</span>
          </p>
        ) : notice ? (
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-[#86c9a4]">
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{notice}</span>
          </p>
        ) : (
          <p className="flex items-start gap-2 font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.14em] text-white/50">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>akun dibuat hanya setelah pembayaran terverifikasi server</span>
          </p>
        )}
      </div>
    </div>
  );
}
