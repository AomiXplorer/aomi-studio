import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { LiveClock } from "@/components/auth/LiveClock";
import { accessProduct } from "@/lib/payments/catalog";

/**
 * The shop wears the same room as the sign-in screen: one dark surface, a single light
 * source, Astra standing to one side, and mono kept to captions instead of carrying the
 * hierarchy. The rail on the right is the receipt the buyer will get, shown before they
 * pay, so nothing about the price or what it buys is a surprise at the end.
 */
export function BuyShell({
  eyebrow,
  children,
  asideTitle = "yang kamu dapat",
  aside = [],
  narrow = false,
}: {
  eyebrow: string;
  children: ReactNode;
  asideTitle?: string;
  aside?: string[];
  narrow?: boolean;
}) {
  const product = accessProduct();

  return (
    <main lang="id" className="a-room relative flex min-h-dvh flex-col overflow-hidden">
      <div className="a-glow" aria-hidden />
      <div className="a-grain" aria-hidden />

      <header className="relative z-20 flex h-[54px] shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#08080a]/70 px-4 backdrop-blur-xl sm:h-[58px] sm:px-7">
        <Link
          href="/login"
          className="group flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
        >
          <span
            aria-hidden
            className="relative grid size-[26px] place-items-center rounded-[7px] border border-white/15 bg-white/[0.04] text-[12.5px] font-semibold leading-none text-white/90 transition-colors duration-200 group-hover:border-white/30 group-hover:text-white"
          >
            a
            <span className="absolute inset-x-1.5 -bottom-px h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-white/70 transition-colors duration-200 group-hover:text-white">
            aomi studio
          </span>
        </Link>

        <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
          <span className="hidden items-center gap-1.5 sm:flex">
            <span aria-hidden className="size-1.5 rounded-full bg-[#86c9a4] shadow-[0_0_8px_rgba(134,201,164,0.65)]" />
            akses berbayar
          </span>
          <span className="hidden h-3 w-px bg-white/10 sm:block" aria-hidden />
          <span className="tabular-nums text-white/70">
            <LiveClock />
          </span>
          <span className="text-white/50">wib</span>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col lg:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,30%)]">
        <section className="relative flex items-start px-5 pb-10 pt-6 sm:px-8 sm:pt-8 lg:items-start lg:px-12 lg:py-12 xl:px-16">
          <div className={narrow ? "w-full max-w-[420px]" : "w-full max-w-[540px]"}>
            <p
              className="a-rise flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.32em] text-white/55"
              style={{ "--i": 0 } as React.CSSProperties}
            >
              <span aria-hidden className="size-1 rounded-full bg-white/25" />
              {eyebrow}
            </p>
            {children}
          </div>
        </section>

        <aside
          className="relative hidden flex-col border-l border-white/[0.06] lg:flex"
          aria-label="Ringkasan pembelian"
        >
          <div className="relative h-[124px] shrink-0 overflow-hidden border-b border-white/[0.06]">
            <Image
              src="/astra.webp"
              alt=""
              aria-hidden
              width={736}
              height={563}
              sizes="30vw"
              className="a-hero-img h-full w-full select-none object-cover object-[56%_32%] opacity-70 grayscale"
            />
            <span
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(to_top,#08080a_4%,rgba(8,8,10,0.5)_52%,rgba(8,8,10,0.2)_100%)]"
            />
            <p className="absolute bottom-3 left-5 font-mono text-[9px] uppercase tracking-[0.3em] text-white/60">
              astra
            </p>
          </div>

          <div className="border-b border-white/[0.06] px-5 py-5">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-white/55">produk</p>
            <p className="mt-2 text-[14.5px] font-medium leading-snug tracking-[-0.01em] text-white/90">
              {product.name}
            </p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-[26px] leading-none tabular-nums tracking-[-0.02em] text-white">
                {rupiah(product.priceIdr)}
              </span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/55">sekali bayar</span>
            </p>
          </div>

          <div className="border-b border-white/[0.06] px-5 py-4">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-white/55">{asideTitle}</p>
          </div>
          <ul className="flex flex-col">
            {aside.map((line, index) => (
              <li
                key={line}
                className="flex items-baseline gap-2.5 border-b border-white/[0.04] px-5 py-2.5 text-[12.5px] leading-relaxed text-white/65"
              >
                <span aria-hidden className="font-mono text-[9.5px] tabular-nums text-white/55">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-auto px-5 py-5">
            <span aria-hidden className="a-rule block" />
            <p className="mt-4 font-mono text-[9.5px] uppercase leading-[1.9] tracking-[0.18em] text-white/55">
              qris · austinpay
              <br />
              akun aktif otomatis
              <br />
              kredensial lewat email
            </p>
          </div>
        </aside>
      </div>

      <footer className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/55 sm:px-7">
        <p>qris · pembayaran diverifikasi server</p>
        <Link
          href="/login"
          className="transition-colors duration-150 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
        >
          kembali ke login
        </Link>
      </footer>
    </main>
  );
}

/** Rupiah on the client without pulling the server catalogue into the bundle. */
export function rupiah(value: number): string {
  return `Rp${Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString("id-ID")}`;
}
