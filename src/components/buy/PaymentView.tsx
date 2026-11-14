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
  const [regenerating, setRegenerating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const stopped = useRef(false);

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
      setNotice("Pembayaran dibatalkan. QRIS ini tidak diproses lagi.");
    } catch {
      setError("Server tidak bisa dihubungi. Coba lagi.");
    } finally {
      setCancelling(false);
    }
  }

  async function regenerate() {
    if (regenerating || !order) return;
    setRegenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/purchase/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: order.email, username: order.username }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string }; order?: { id: string }; token?: string }
        | null;
      if (!response.ok || !payload?.order || !payload.token) {
        setError(payload?.error?.message || "Gagal membuat QRIS baru.");
        return;
      }
      router.replace(
        `/buy/pay?order=${encodeURIComponent(payload.order.id)}&t=${encodeURIComponent(payload.token)}`,
      );
    } catch {
      setError("Server tidak bisa dihubungi. Coba lagi.");
    } finally {
      setRegenerating(false);
    }
  }

  const remaining = order?.expiresAt ? Date.parse(order.expiresAt) - now : 0;
  const expired = Boolean(order) && order?.status === "pending" && remaining <= 0;
  const statusLabel =
    order?.status === "paid"
      ? ready
        ? "Pembayaran terverifikasi"
        : "Pembayaran diterima, menyiapkan akun"
      : order?.status === "expired" || expired
        ? "QRIS kedaluwarsa"
        : order?.status === "cancelled"
          ? "Dibatalkan"
          : order?.status === "failed"
            ? "Pembayaran gagal"
            : "Menunggu pembayaran";

  if (loading && !order) {
    return (
      <div className="mt-10 flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.16em] text-[#8b8b96]">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        memuat qris
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mt-8 border border-[#27272a] p-5">
        <p className="text-[14px] text-[#fafafa]">Pembayaran ini tidak bisa dibuka.</p>
        <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-[#8b8b96]">
          {error || "Link pembayaran tidak valid atau sudah diganti dengan yang baru."}
        </p>
        <Link
          href="/buy"
          className="mt-4 inline-flex h-10 items-center gap-2 bg-[#fafafa] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#09090b]"
        >
          Mulai pembelian baru
        </Link>
      </div>
    );
  }

  const payable = order.payableAmount || order.requestedAmount;

  return (
    <div className="sh-enter mt-7" style={{ "--sh-delay": "140ms" } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-medium leading-[1.15] tracking-[-0.025em] text-[#fafafa] sm:text-[30px]">
            {order.status === "paid" ? "Pembayaran diterima" : "Scan QRIS untuk bayar"}
          </h1>
          <p className="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-[#a1a1aa]">
            Silakan scan QRIS untuk menyelesaikan pembelian Aomi. Bayar tepat sejumlah nominal di bawah, termasuk kode unik.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[#1c1c20] py-3 font-mono text-[10.5px] uppercase tracking-[0.14em]">
        <span className="flex items-center gap-2 text-[#d4d4d8]">
          <span
            className={`size-1.5 ${order.status === "paid" ? "bg-[#86c9a4]" : expired ? "bg-[#e58f8f]" : "bg-[#fafafa] animate-pulse"}`}
            aria-hidden
          />
          {statusLabel}
        </span>
        <span className="text-[#3a3a3f]" aria-hidden>
          /
        </span>
        <span className="text-[#8b8b96]">
          {order.status === "pending" ? `sisa ${clock(remaining)}` : order.transactionId || order.id}
        </span>
        <span className="text-[#3a3a3f]" aria-hidden>
          /
        </span>
        <span className="text-[#8b8b96]">{order.transactionId || order.id}</span>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div className="pay-fade mx-auto w-full max-w-[260px] rounded-lg bg-white p-3">
          {order.qrImage ? (
            <img
              src={order.qrImage}
              alt="QRIS pembayaran Aomi"
              width={236}
              height={236}
              className="block w-full rounded-md"
            />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-md bg-[#f4f4f6] font-mono text-[10px] uppercase tracking-[0.14em] text-[#52525b]">
              qris tidak tersedia
            </div>
          )}
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8b96]">nominal yang harus dibayar</p>
          <p className="mt-1.5 font-mono text-[30px] leading-none tabular-nums tracking-[-0.02em] text-[#fafafa]">
            {rupiah(payable)}
          </p>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-[#8b8b96]">
            {order.requestedAmount === payable
              ? "sudah termasuk biaya layanan"
              : `${rupiah(order.requestedAmount)} + biaya QRIS ${rupiah(Math.max(0, payable - order.requestedAmount))}`}
          </p>

          <dl className="mt-5 divide-y divide-[#1c1c20] border-y border-[#1c1c20] font-mono text-[11.5px]">
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-[#8b8b96]">produk</dt>
              <dd className="text-[#d4d4d8]">Aomi AI Access</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-[#8b8b96]">username</dt>
              <dd className="max-w-[60%] truncate text-[#d4d4d8]">{order.username}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-[#8b8b96]">email</dt>
              <dd className="max-w-[60%] truncate text-[#d4d4d8]">{order.email}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="text-[#8b8b96]">transaction id</dt>
              <dd className="max-w-[60%] truncate text-[#d4d4d8]">{order.transactionId || "—"}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void fetchStatus(true)}
              disabled={checking}
              className="sh-submit flex h-11 items-center justify-between gap-3 bg-[#fafafa] px-4 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#09090b] transition-colors hover:bg-[#d4d4d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] disabled:cursor-wait disabled:bg-[#18181b] disabled:text-[#8b8b96]"
            >
              <span className="flex items-center gap-2">
                {checking ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
                {checking ? "Memeriksa" : "Check Payment Status"}
              </span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void copyAmount()}
                className="flex h-10 items-center justify-center gap-2 border border-[#27272a] font-mono text-[11px] uppercase tracking-[0.12em] text-[#a1a1aa] transition-colors hover:border-[#3a3a3f] hover:text-[#fafafa]"
              >
                <Copy className="size-3.5" aria-hidden />
                Copy Amount
              </button>
              <button
                type="button"
                onClick={() => void cancel()}
                disabled={cancelling || order.status !== "pending"}
                className="flex h-10 items-center justify-center gap-2 border border-[#27272a] font-mono text-[11px] uppercase tracking-[0.12em] text-[#8b8b96] transition-colors hover:border-[#e58f8f]/40 hover:text-[#e58f8f] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <X className="size-3.5" aria-hidden />
                {cancelling ? "Membatalkan" : "Cancel Payment"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div aria-live="polite" className="mt-5 min-h-[38px]">
        {error ? (
          <p role="alert" className="flex items-start gap-2 font-mono text-[11.5px] leading-relaxed text-[#e58f8f]">
            <span aria-hidden>!</span>
            <span>{error}</span>
          </p>
        ) : notice ? (
          <p className="flex items-start gap-2 font-mono text-[11.5px] leading-relaxed text-[#86c9a4]">
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{notice}</span>
          </p>
        ) : (
          <p className="flex items-start gap-2 font-mono text-[11.5px] leading-relaxed text-[#8b8b96]">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              status dicek otomatis tiap 5 detik. akun dibuat hanya setelah pembayaran benar-benar terverifikasi.
            </span>
          </p>
        )}
      </div>

      {expired || order.status === "expired" ? (
        <div className="mt-4 border border-[#27272a] bg-[#111113] p-4">
          <p className="text-[13.5px] text-[#fafafa]">QRIS ini sudah kedaluwarsa.</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#a1a1aa]">
            Belum ada dana yang masuk, jadi belum ada akun yang dibuat. Buat QRIS baru untuk melanjutkan.
          </p>
          <button
            type="button"
            onClick={() => void regenerate()}
            disabled={regenerating}
            className="mt-3 inline-flex h-10 items-center gap-2 bg-[#fafafa] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#09090b] disabled:cursor-wait disabled:bg-[#18181b] disabled:text-[#8b8b96]"
          >
            {regenerating ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            Buat QRIS baru
          </button>
        </div>
      ) : null}

      {order.status === "cancelled" ? (
        <div className="mt-4 border border-[#27272a] bg-[#111113] p-4">
          <p className="text-[13.5px] text-[#fafafa]">Pembayaran dibatalkan.</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#a1a1aa]">
            Kalau berubah pikiran, kamu bisa mulai lagi dari awal. Kalau ternyata sudah terlanjur transfer, dana akan
            tercatat dan bisa dibantu lewat owner.
          </p>
          <Link
            href="/buy"
            className="mt-3 inline-flex h-10 items-center bg-[#fafafa] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#09090b]"
          >
            Mulai lagi
          </Link>
        </div>
      ) : null}
    </div>
  );
}
