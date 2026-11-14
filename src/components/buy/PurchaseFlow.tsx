"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Mail, AtSign } from "lucide-react";
import { rupiah } from "./BuyShell";

interface Product {
  name: string;
  priceIdr: number;
  billing: string;
  grants: string;
}

type Step = 1 | 2;

const row = "grid grid-cols-[1.5rem_1px_minmax(0,1fr)] items-stretch";

/**
 * Two steps, one question each.
 *
 * Both answers are checked by the server before the form moves on, so the summary the
 * buyer reads on step two is already a name and an address nobody else owns.
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

  return (
    <div className="sh-enter mt-7" style={{ "--sh-delay": "140ms" } as React.CSSProperties}>
      <div className="flex items-center gap-2" aria-hidden>
        <span className={`h-[2px] flex-1 ${step >= 1 ? "bg-[#fafafa]" : "bg-[#27272a]"}`} />
        <span className={`h-[2px] flex-1 ${step >= 2 ? "bg-[#fafafa]" : "bg-[#27272a]"}`} />
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8b96]">
        langkah {step} dari 2
      </p>

      <div className="mt-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-medium leading-[1.15] tracking-[-0.025em] text-[#fafafa] sm:text-[30px]">
            {step === 1 ? "Let's get started!" : "Choose your username"}
          </h1>
          <p className="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-[#a1a1aa]">
            {step === 1
              ? "Masukkan email kamu untuk mendapatkan akses Aomi. Kredensial login dikirim ke alamat ini."
              : "Tentukan username yang akan kamu gunakan untuk login ke Aomi."}
          </p>
        </div>
        <span className="mt-1 hidden shrink-0 items-center gap-2 border border-[#27272a] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a1a1aa] sm:flex">
          {step === 1 ? <Mail className="size-3" aria-hidden /> : <AtSign className="size-3" aria-hidden />}
          {step === 1 ? "email" : "username"}
        </span>
      </div>

      {step === 1 ? (
        <form onSubmit={submitEmail} noValidate className="mt-8">
          <div className={error ? "sh-shake" : undefined}>
            <div className={`${row} sh-field`} data-invalid={Boolean(error)}>
              <span className="sh-gutter pr-2 pt-4 font-mono text-[10px] leading-none text-[#8b8b96]">01</span>
              <span className="bg-[#1c1c20]" aria-hidden />
              <div className="sh-ruler px-4 pb-3.5 pt-3.5">
                <label htmlFor="buy-email" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8b96]">
                  Gmail / Email Address
                </label>
                <div className="flex items-baseline gap-2">
                  <span className="select-none font-mono text-[13px] leading-none text-[#3a3a3f]" aria-hidden>
                    ›
                  </span>
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
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "buy-error" : undefined}
                    placeholder="nama@gmail.com"
                    className="w-full bg-transparent font-mono text-[14px] leading-none tracking-[-0.01em] text-[#fafafa] outline-none placeholder:text-[#52525b]"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="sh-submit mt-5 flex h-12 w-full items-center justify-between gap-3 bg-[#fafafa] px-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#09090b] transition-colors hover:bg-[#d4d4d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] disabled:cursor-wait disabled:bg-[#18181b] disabled:text-[#8b8b96]"
          >
            <span className="flex items-center gap-2">
              {pending ? "Memeriksa" : "Continue"}
              {pending ? <span className="sh-dots" aria-hidden /> : null}
            </span>
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </form>
      ) : (
        <form onSubmit={submitUsername} noValidate className="mt-8">
          <div className={error ? "sh-shake" : undefined}>
            <div className={`${row} sh-field`} data-invalid={Boolean(error)}>
              <span className="sh-gutter pr-2 pt-4 font-mono text-[10px] leading-none text-[#8b8b96]">02</span>
              <span className="bg-[#1c1c20]" aria-hidden />
              <div className="sh-ruler px-4 pb-3.5 pt-3.5">
                <label htmlFor="buy-username" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8b96]">
                  Username
                </label>
                <div className="flex items-baseline gap-2">
                  <span className="select-none font-mono text-[13px] leading-none text-[#3a3a3f]" aria-hidden>
                    ›
                  </span>
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
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "buy-error" : "buy-username-hint"}
                    placeholder="mis. langitbiru"
                    className="w-full bg-transparent font-mono text-[14px] leading-none tracking-[-0.01em] text-[#fafafa] outline-none placeholder:text-[#52525b]"
                  />
                </div>
              </div>
            </div>
            <p id="buy-username-hint" className="mt-2 pl-[calc(1.5rem+1px+1rem)] font-mono text-[10.5px] leading-relaxed text-[#8b8b96]">
              3–32 karakter · huruf, angka, titik, garis bawah, strip
            </p>
          </div>

          <dl className="mt-6 divide-y divide-[#1c1c20] border-y border-[#1c1c20]">
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[13px] text-[#a1a1aa]">{product.name}</dt>
              <dd className="font-mono text-[13px] tabular-nums text-[#fafafa]">{rupiah(product.priceIdr)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[13px] text-[#a1a1aa]">Email pembeli</dt>
              <dd className="max-w-[62%] truncate font-mono text-[12.5px] text-[#d4d4d8]" title={email}>
                {email}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[13px] text-[#a1a1aa]">Username pilihan</dt>
              <dd className="font-mono text-[12.5px] text-[#d4d4d8]">{username.trim() || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[13px] text-[#a1a1aa]">Pembayaran</dt>
              <dd className="font-mono text-[12.5px] text-[#d4d4d8]">QRIS · sekali bayar</dd>
            </div>
          </dl>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(1);
              }}
              disabled={pending}
              className="flex h-12 items-center gap-2 border border-[#27272a] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#a1a1aa] transition-colors hover:border-[#3a3a3f] hover:text-[#fafafa] disabled:opacity-50"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Ubah email
            </button>
            <button
              type="submit"
              disabled={pending}
              className="sh-submit flex h-12 flex-1 items-center justify-between gap-3 bg-[#fafafa] px-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#09090b] transition-colors hover:bg-[#d4d4d8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] disabled:cursor-wait disabled:bg-[#18181b] disabled:text-[#8b8b96]"
            >
              <span className="flex items-center gap-2">
                {pending ? "Menyiapkan QRIS" : "Continue to Payment"}
                {pending ? <span className="sh-dots" aria-hidden /> : null}
              </span>
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </form>
      )}

      <div aria-live="polite" className="min-h-[38px] pt-3">
        {error ? (
          <p id="buy-error" role="alert" className="sh-enter flex items-start gap-2 font-mono text-[11.5px] leading-relaxed text-[#e58f8f]">
            <span className="select-none" aria-hidden>
              !
            </span>
            <span>{error}</span>
          </p>
        ) : (
          <p className="font-mono text-[11.5px] leading-relaxed text-[#8b8b96]">
            {notice || (pending ? "memeriksa data" : "data kamu hanya dipakai untuk membuat akun")}
          </p>
        )}
      </div>

      <div className={`${row} mt-6`}>
        <span className="pt-1" aria-hidden />
        <span className="bg-[#1c1c20]" aria-hidden />
        <div className="px-4">
          <p className="font-mono text-[11px] leading-relaxed text-[#8b8b96]">
            sudah punya akun?{" "}
            <Link href="/login" className="text-[#fafafa] underline decoration-[#3a3a3f] underline-offset-4 hover:decoration-[#fafafa]">
              login di sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
