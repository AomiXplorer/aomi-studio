"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CreditCard, Loader2, Mail, RefreshCw, RotateCcw, Send, KeyRound, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

interface AdminOrder {
  id: string;
  product: string;
  email: string;
  username: string;
  requestedAmount: number;
  payableAmount: number;
  status: "pending" | "paid" | "expired" | "failed" | "cancelled";
  provisionStatus: "none" | "pending" | "done" | "failed";
  emailStatus: "none" | "pending" | "sent" | "failed";
  transactionId: string;
  expiresAt: string;
  paidAt: string;
  createdAt: string;
  updatedAt: string;
  emailSentAt: string;
  userId: string;
  provisionError: string;
  emailError: string;
  providerError: string;
  settledBy: string;
}

interface Payload {
  product: { name: string; priceIdr: number };
  orders: AdminOrder[];
  stats: {
    users: number;
    paidUsers: number;
    paid: number;
    pending: number;
    failed: number;
    revenue: number;
    emailsSent: number;
    emailsFailed: number;
  };
  config: {
    austin: { configured: boolean; signed: boolean; baseUrl: string; keyFingerprint: string; webhookConfigured: boolean; missing: string[] };
    smtp: { configured: boolean; host: string; port: number; from: string; missing: string[] };
    webhookPath: string;
  };
}

function rupiah(value: number): string {
  return `Rp${Math.max(0, Math.trunc(value || 0)).toLocaleString("id-ID")}`;
}

function when(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUS_TONE: Record<AdminOrder["status"], "ok" | "warn" | "danger" | "neutral"> = {
  paid: "ok",
  pending: "warn",
  expired: "neutral",
  failed: "danger",
  cancelled: "neutral",
};

/**
 * Payment management: every order, what happened to it, and the four safe repairs.
 *
 * Nothing here can create a second account or a second password: retry provision is
 * idempotent, retry email reuses the stored ciphertext, and reset credentials deliberately
 * issues a new password and says so.
 */
export function PaymentsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/payments", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "Gagal memuat data pembayaran.");
      setData(payload as Payload);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat data pembayaran.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (key: string, body: Record<string, unknown>) => {
      setBusy(key);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch("/api/admin/payments/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error?.message || "Aksi ditolak.");
        setNotice(
          typeof payload?.message === "string"
            ? payload.message
            : payload?.account
              ? `AustinPay OK · ${payload.account.username} · saldo ${rupiah(payload.account.balance)}`
              : "Selesai.",
        );
        await load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Aksi ditolak.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const missing = useMemo(() => {
    if (!data) return [] as string[];
    const list: string[] = [];
    if (!data.config.austin.configured) list.push("AUSTIN_API_KEY");
    if (!data.config.austin.signed) list.push("AUSTIN_API_SECRET");
    if (!data.config.austin.webhookConfigured) list.push("AUSTINPAY_WEBHOOK_SECRET");
    list.push(...data.config.smtp.missing);
    return list;
  }, [data]);

  if (!data) {
    return error ? (
      <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-ink">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {error}
      </p>
    ) : (
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading payments…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Total pengguna", value: String(data.stats.users), hint: `${data.stats.paidUsers} akun berbayar` },
          { label: "Transaksi sukses", value: String(data.stats.paid), hint: `${data.stats.emailsSent} email terkirim` },
          { label: "Pending", value: String(data.stats.pending), hint: "belum dibayar" },
          { label: "Gagal / expired", value: String(data.stats.failed), hint: `${data.stats.emailsFailed} email gagal` },
          { label: "Pendapatan", value: rupiah(data.stats.revenue), hint: "dari transaksi sukses" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-line bg-panel px-3.5 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-faint">{item.label}</p>
            <p className="mt-1 truncate text-[19px] font-semibold tabular-nums leading-none text-ink">{item.value}</p>
            <p className="mt-1.5 text-[11px] text-faint">{item.hint}</p>
          </div>
        ))}
      </section>

      {missing.length > 0 ? (
        <section className="rounded-xl border border-line bg-panel p-4">
          <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
            <AlertTriangle className="size-4" aria-hidden /> Konfigurasi yang belum lengkap
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Pembelian otomatis butuh variabel ini di Vercel. Selama kosong, pembeli tidak bisa menyelesaikan pesanan.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {missing.map((name) => (
              <li key={name}>
                <Badge tone="warn">{name}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
              <ShieldCheck className="size-4" aria-hidden /> Koneksi pembayaran
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={data.config.austin.configured ? "ok" : "danger"}>api key {data.config.austin.keyFingerprint}</Badge>
              <Badge tone={data.config.austin.signed ? "ok" : "warn"}>{data.config.austin.signed ? "hmac aktif" : "tanpa hmac"}</Badge>
              <Badge tone={data.config.austin.webhookConfigured ? "ok" : "danger"}>
                {data.config.austin.webhookConfigured ? "webhook secret ada" : "webhook secret belum ada"}
              </Badge>
              <Badge tone={data.config.smtp.configured ? "ok" : "warn"}>
                {data.config.smtp.configured ? `smtp ${data.config.smtp.host}` : "smtp belum lengkap"}
              </Badge>
            </div>
            <p className="mt-2 break-all font-mono text-[11px] text-faint">
              webhook url: {origin}
              {data.config.webhookPath}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void act("probe", { action: "probeProvider" })}
            disabled={busy === "probe"}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-60"
          >
            {busy === "probe" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            Cek kredensial
          </button>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
          &quot;Cek kredensial&quot; mengirim satu request ke AustinPay dan tidak membuat transaksi. Endpoint pembuatan QRIS dibatasi
          5 request per menit, jadi jangan dipakai untuk uji berulang.
        </p>
      </section>

      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-muted">
          <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {notice}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-3 py-2">
          <p className="flex items-center gap-2 text-[12px] font-medium text-ink">
            <CreditCard className="size-3.5" aria-hidden /> Transaksi
          </p>
          <span className="font-mono text-[11px] text-faint">{data.orders.length} baris</span>
        </div>
        {data.orders.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-faint">Belum ada transaksi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-faint">
                  <th className="px-3 py-2 font-medium">Transaksi</th>
                  <th className="px-3 py-2 font-medium">Pembeli</th>
                  <th className="px-3 py-2 font-medium">Nominal</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">Email</th>
                  <th className="px-3 py-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr key={order.id} className="border-b border-line align-top last:border-0">
                    <td className="px-3 py-2.5">
                      <p className="font-mono text-[11.5px] text-ink">{order.transactionId || order.id}</p>
                      <p className="mt-0.5 font-mono text-[10.5px] text-faint">{when(order.createdAt)}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-[12.5px] text-ink">{order.username}</p>
                      <p className="truncate text-[11px] text-faint">{order.email}</p>
                      {order.settledBy ? <p className="mt-0.5 font-mono text-[10px] text-faint">via {order.settledBy}</p> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="tabular-nums text-[12.5px] text-ink">{rupiah(order.payableAmount || order.requestedAmount)}</p>
                      {order.payableAmount !== order.requestedAmount ? (
                        <p className="font-mono text-[10.5px] text-faint">harga {rupiah(order.requestedAmount)}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STATUS_TONE[order.status]}>{order.status}</Badge>
                      <p className="mt-1 font-mono text-[10.5px] text-faint">
                        akun: {order.provisionStatus}
                        {order.paidAt ? ` · ${when(order.paidAt)}` : ""}
                      </p>
                      {order.provisionError ? (
                        <p className="mt-1 max-w-[220px] text-[10.5px] leading-snug text-danger">{order.provisionError}</p>
                      ) : null}
                      {order.providerError ? (
                        <p className="mt-1 max-w-[220px] text-[10.5px] leading-snug text-danger">{order.providerError}</p>
                      ) : null}
                    </td>
                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      <Badge tone={order.emailStatus === "sent" ? "ok" : order.emailStatus === "failed" ? "danger" : "neutral"}>
                        {order.emailStatus}
                      </Badge>
                      {order.emailError ? (
                        <p className="mt-1 max-w-[180px] text-[10.5px] leading-snug text-faint">{order.emailError}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {order.status === "paid" && order.provisionStatus !== "done" ? (
                          <MiniAction
                            label="Buat akun"
                            icon={<RotateCcw className="size-3" aria-hidden />}
                            disabled={busy === `prov:${order.id}`}
                            onClick={() => void act(`prov:${order.id}`, { action: "retryProvision", orderId: order.id })}
                          />
                        ) : null}
                        {order.userId ? (
                          <>
                            <MiniAction
                              label="Kirim ulang"
                              icon={<Send className="size-3" aria-hidden />}
                              disabled={busy === `mail:${order.id}`}
                              onClick={() => void act(`mail:${order.id}`, { action: "retryEmail", orderId: order.id })}
                            />
                            <MiniAction
                              label="Reset password"
                              icon={<KeyRound className="size-3" aria-hidden />}
                              disabled={busy === `reset:${order.id}`}
                              onClick={() => void act(`reset:${order.id}`, { action: "resetCredentials", orderId: order.id })}
                            />
                          </>
                        ) : null}
                        {order.status === "pending" ? (
                          <MiniAction
                            label="Batalkan"
                            icon={<X className="size-3" aria-hidden />}
                            disabled={busy === `cancel:${order.id}`}
                            onClick={() => void act(`cancel:${order.id}`, { action: "cancelOrder", orderId: order.id })}
                          />
                        ) : null}
                        {order.userId && order.emailStatus === "failed" ? (
                          <span className="inline-flex items-center gap-1 text-[10.5px] text-faint">
                            <Mail className="size-3" aria-hidden /> email gagal
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MiniAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[11px] text-muted transition-colors",
        "hover:border-line-strong hover:text-ink disabled:cursor-wait disabled:opacity-50",
      )}
    >
      {disabled ? <Loader2 className="size-3 animate-spin" aria-hidden /> : icon}
      {label}
    </button>
  );
}
