import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { LiveClock } from "@/components/auth/LiveClock";

/**
 * The shop wears the same sheet as the sign-in screen: dark, one neutral ink accent,
 * mono for structure, Jakarta for sentences. Astra stays as a quiet ground so the
 * content is always the loudest thing on the page.
 */
export function BuyShell({
  eyebrow,
  children,
  asideTitle = "yang kamu dapat",
  aside = [],
}: {
  eyebrow: string;
  children: ReactNode;
  asideTitle?: string;
  aside?: string[];
}) {
  return (
    <main lang="id" className="relative flex min-h-dvh flex-col overflow-hidden bg-[#09090b] text-[#fafafa]">
      <Image
        src="/astra.webp"
        alt=""
        aria-hidden
        width={736}
        height={563}
        priority
        className="pointer-events-none absolute -right-20 -top-24 hidden h-[58vh] w-auto select-none opacity-[0.14] [mask-image:linear-gradient(to_bottom_left,black,transparent_70%)] lg:block"
      />

      <header className="sh-enter flex items-center justify-between gap-4 border-b border-[#1c1c20] px-5 py-4 sm:px-8">
        <Link href="/login" className="flex items-center gap-3 no-underline">
          <span
            className="grid size-7 place-items-center border border-[#3a3a3f] text-[13px] font-semibold leading-none text-[#fafafa]"
            aria-hidden
          >
            a
          </span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-[#a1a1aa]">aomi studio</span>
        </Link>
        <div className="flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8b8b96]">
          <span className="hidden sm:inline">akses baru</span>
          <span className="hidden text-[#3a3a3f] sm:inline" aria-hidden>
            /
          </span>
          <LiveClock />
          <span>wib</span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex items-start px-5 py-8 sm:px-8 sm:py-12 lg:px-14">
          <div className="w-full max-w-[520px]">
            <p
              className="sh-enter flex items-center gap-1.5 font-mono text-[11px] text-[#8b8b96]"
              style={{ "--sh-delay": "60ms" } as React.CSSProperties}
            >
              ~/aomi
              <span aria-hidden>/</span>
              {eyebrow}
              <span className="aomi-caret ml-1" aria-hidden />
            </p>
            {children}
          </div>
        </section>

        <aside className="hidden border-l border-[#1c1c20] lg:flex lg:flex-col" aria-label="Ringkasan pembelian">
          <div className="border-b border-[#1c1c20] px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8b96]">{asideTitle}</p>
          </div>
          <ul className="flex flex-col">
            {aside.map((line, index) => (
              <li
                key={line}
                className="flex items-baseline justify-between gap-3 border-b border-[#18181b] px-5 py-[11px] font-mono text-[11px] text-[#a1a1aa]"
              >
                <span>{line}</span>
                <span className="text-[#52525b]">{String(index + 1).padStart(2, "0")}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto border-t border-[#1c1c20] px-5 py-4">
            <p className="font-mono text-[10px] leading-relaxed text-[#8b8b96]">
              qris · bayar sekali
              <br />
              akun aktif otomatis
            </p>
          </div>
        </aside>
      </div>

      <footer className="flex flex-col gap-1.5 border-t border-[#1c1c20] px-5 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b8b96] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>qris austinpay · verifikasi webhook</p>
        <p>aomi studio — akses berbayar</p>
      </footer>
    </main>
  );
}

/** Rupiah on the client without pulling the server catalogue into the bundle. */
export function rupiah(value: number): string {
  return `Rp${Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString("id-ID")}`;
}
