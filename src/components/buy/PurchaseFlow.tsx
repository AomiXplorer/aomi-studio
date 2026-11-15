"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowLeft, AtSign, Mail } from "lucide-react";
import { rupiah } from "./BuyShell";

interface Product {
  name: string;
  priceIdr: number;
  billing: string;
  grants: string;
}

type Step = 1 | 2;

/**
 * Two questions, one screen each.
 *
 * Both answers are checked by the server before the form moves on, so the summary the
 * buyer reads on step two is already a name and an address nobody else owns. Every exit
 * leads back to the sign-in room rather than leaving someone parked on a dead form.
 */
export function PurchaseFlow({ product }: { product: Product }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submitEmail = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (pending) return;
      setError(null);
      setNotice(null);
      if (!email.trim()) {
        setError("Email wajib diisi.");
        return;
      }
      setPending(true);
      try {
        const response = await fetch("/api/purchase/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; email?: string } | null;
        if (!response.ok) {
          setError(payload?.error?.message || "Email ini belum bisa dipakai. Coba lagi.");
          return;
        }
        if (payload?.email) setEmail(payload.email);
        setStep(2);
      } catch {
        setError("Tidak bisa menghubungi server. Cek koneksi lalu coba lagi.");
      } finally {
        setPending(false);
      }
    },
    [email, pending],
  );

  const submitUsername = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (pending) return;
      setError(null);
      setNotice(null);
      if (!username.trim()) {
        setError("Username wajib diisi.");
        return;
      }
      setPending(true);
      try {
        const check = await fetch("/api/purchase/check-username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
          cache: "no-store",
        });
        const checkPayload = (await check.json().catch(() => null)) as { error?: { message?: string } } | null;
        if (!check.ok) {
          setError(checkPayload?.error?.message || "Username ini tidak bisa dipakai.");
          return;
        }

        const response = await fetch("/api/purchase/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, username }),
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string }; order?: { id: string }; token?: string }
          | null;
        if (!response.ok || !payload?.order || !payload.token) {
          setError(payload?.error?.message || "Gagal membuat pembayaran. Coba lagi sebentar.");
          return;
        }
        router.push(`/buy/pay?order=${encodeURIComponent(payload.order.id)}&t=${encodeURIComponent(payload.token)}`);
      } catch {
        setError("Tidak bisa menghubungi server. Cek koneksi lalu coba lagi.");
      } finally {
        setPending(false);
      }
    },
    [email, pending, router, username],
  );

  const invalid = Boolean(error);

  return (
    <div className="mt-6">
      {/* Where you are, said once. The two segments are the whole progress bar. */}
      <ol className="a-rise flex items-center gap-3" style={{ "--i": 1 } as React.CSSProperties}>
        {[
          { index: 1 as Step, label: "email" },
          { index: 2 as Step, label: "username" },
        ].map((item) => {
          const active = step === item.index;
          const done = step > item.index;
          return (
            <li key={item.label} className="flex flex-1 flex-col gap-1.5">
              <span
                aria-hidden
                className={`h-px w-full transition-colors duration-300 ${
                  active ? "bg-white/70" : done ? "bg-white/30" : "bg-white/10"
                }`}
              />
              <span
                className={`font-mono text-[9px] uppercase tracking-[0.22em] transition-colors duration-200 ${
                  active ? "text-white/70" : "text-white/50"
                }`}
              >
                {String(item.index).padStart(2, "0")} · {item.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="a-rise mt-7" style={{ "--i": 2 } as React.CSSProperties}>
        <h1 className="text-[28px] font-medium leading-[1.08] tracking-[-0.035em] text-white sm:text-[34px]">
          {step === 1 ? "Let's get started." : "Pick your handle."}
        </h1>
        <p className="mt-2.5 max-w-[44ch] text-[13.5px] leading-relaxed text-white/55">
          {step === 1
            ? "Satu email untuk menerima kredensial login. Tidak ada langganan, tidak ada tagihan berikutnya."
            : "Username ini yang kamu pakai untuk masuk ke Aomi, dan bisa diganti nanti di dalam workspace."}
        </p>
      </div>

      {/* The price, before the form asks for anything. */}
      <div className="a-rise mt-6 flex items-center justify-between gap-4 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3.5" style={{ "--i": 3 } as React.CSSProperties}>
        <div>
          <p className="text-[13px] font-medium leading-snug tracking-[-0.01em] text-white/85">{product.name}</p>
          <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/55">
            akses penuh · qris · sekali bayar
          </p>
        </div>
        <p className="shrink-0 font-mono text-[19px] leading-none tabular-nums tracking-[-0.02em] text-white">
          {rupiah(product.priceIdr)}
        </p>
      </div>

      {step === 1 ? (
        <form onSubmit={submitEmail} noValidate className="a-rise mt-6" style={{ "--i": 4 } as React.CSSProperties}>
          <div className={`a-field ${error ? "a-shake" : ""}`} data-invalid={invalid}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label htmlFor="buy-email" className="text-[12px] font-medium tracking-[-0.01em] text-white/70">
                Email
              </label>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/20" aria-hidden>
                kredensial dikirim ke sini
              </span>
            </div>
            <div className="a-input">
              <Mail className="size-4 shrink-0 text-white/55" aria-hidden />
              <input
                id="buy-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={invalid}
                aria-describedby={error ? "buy-error" : undefined}
                placeholder="nama@gmail.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="a-submit mt-5 flex h-12 w-full items-center justify-center gap-2 bg-[#fafafa] text-[13.5px] font-semibold tracking-[-0.01em] text-[#09090b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/55"
          >
            {pending ? (
              <>
                <span className="a-spin" aria-hidden />
                Memeriksa
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="a-submit-arrow size-4" aria-hidden />
              </>
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={submitUsername} noValidate className="a-rise mt-6" style={{ "--i": 4 } as React.CSSProperties}>
          <div className={`a-field ${error ? "a-shake" : ""}`} data-invalid={invalid}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label htmlFor="buy-username" className="text-[12px] font-medium tracking-[-0.01em] text-white/70">
                Username
              </label>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/20" aria-hidden>
                id login
              </span>
            </div>
            <div className="a-input">
              <AtSign className="size-4 shrink-0 text-white/55" aria-hidden />
              <input
                id="buy-username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                autoFocus
                minLength={3}
                maxLength={32}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-invalid={invalid}
                aria-describedby={error ? "buy-error" : "buy-username-hint"}
                placeholder="mis. langitbiru"
              />
            </div>
            <p id="buy-username-hint" className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/50">
              3–32 karakter · huruf, angka, titik, garis bawah, strip
            </p>
          </div>

          <dl className="mt-5 divide-y divide-white/[0.06] rounded-lg border border-white/[0.08] px-4">
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[12.5px] text-white/55">Email penerima</dt>
              <dd className="max-w-[62%] truncate font-mono text-[12px] text-white/85" title={email}>
                {email}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[12.5px] text-white/55">Username</dt>
              <dd className="font-mono text-[12px] text-white/85">{username.trim() || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[12.5px] text-white/55">Total sekali bayar</dt>
              <dd className="font-mono text-[12.5px] tabular-nums text-white">{rupiah(product.priceIdr)}</dd>
            </div>
          </dl>

          <div className="mt-5 flex items-stretch gap-2.5">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(1);
              }}
              disabled={pending}
              aria-label="Ubah email"
              className="flex size-12 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/55 transition-colors duration-150 hover:border-white/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </button>
            <button
              type="submit"
              disabled={pending}
              className="a-submit flex h-12 flex-1 items-center justify-center gap-2 bg-[#fafafa] text-[13.5px] font-semibold tracking-[-0.01em] text-[#09090b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/55"
            >
              {pending ? (
                <>
                  <span className="a-spin" aria-hidden />
                  Menyiapkan QRIS
                </>
              ) : (
                <>
                  Lanjut ke pembayaran
                  <ArrowRight className="a-submit-arrow size-4" aria-hidden />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      <div aria-live="polite" className="mt-3 min-h-[38px]">
        {error ? (
          <p id="buy-error" role="alert" className="flex items-start gap-2 text-[12px] leading-relaxed text-[#e58f8f]">
            <span aria-hidden className="mt-px font-mono">
              !
            </span>
            <span>{error}</span>
          </p>
        ) : (
          <p className="flex items-center gap-2 font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.16em] text-white/55">
            <span aria-hidden className={`size-1.5 rounded-full ${pending ? "animate-pulse bg-white/70" : "bg-white/25"}`} />
            {notice || (pending ? "memeriksa data" : "data kamu hanya dipakai untuk membuat akun")}
          </p>
        )}
      </div>

      <div className="mt-6">
        <span aria-hidden className="a-rule block" />
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
          <p className="text-[12px] leading-relaxed text-white/50">
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="font-medium text-white/80 underline decoration-white/20 underline-offset-4 transition-colors duration-150 hover:text-white hover:decoration-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
            >
              Login di sini
            </Link>
          </p>
          <Link
            href="/login"
            className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/50 transition-colors duration-150 hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
          >
            batalkan
          </Link>
        </div>
      </div>
    </div>
  );
}
