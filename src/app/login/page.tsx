import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { LiveClock } from "@/components/auth/LiveClock";
import { loadAuthConfig, ownerWhatsApp } from "@/lib/auth/config";
import { accessPriceIdr } from "@/lib/payments/catalog";
import { toolNames } from "@/lib/agent/tools";

export const metadata: Metadata = {
  title: "Sign in — Aomi",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * The gate. One dark room, one light source, and Astra standing in it — the
 * artwork carries the identity, the type carries the hierarchy, and the form is
 * the only thing that asks for anything. Mono is kept as a whisper (labels,
 * captions, the clock) instead of doing the structural work it used to do.
 */
/** One line, said plainly, for anyone the shop sent back here. */
const RETURN_NOTES: Record<string, string> = {
  cancelled: "Pembelian dibatalkan. Tidak ada biaya yang dikenakan.",
  expired: "Waktu pembayaran habis. Silakan mulai lagi kalau masih mau akses.",
  failed: "Pembayaran tidak berhasil. Coba lagi atau hubungi owner.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; status?: string | string[] }>;
}) {
  const params = await searchParams;
  const state = await loadAuthConfig();
  const next = typeof params.next === "string" ? params.next : undefined;
  const note = typeof params.status === "string" ? RETURN_NOTES[params.status] || "" : "";

  // Straight from the registry, so the rail can never advertise a tool that does not exist.
  const tools = toolNames();

  return (
    <main lang="en" className="a-room relative flex min-h-dvh flex-col overflow-hidden">
      <div className="a-glow" aria-hidden />
      <div className="a-grain" aria-hidden />

      {/* Header: 54px on a phone, 58px on a desk. It frames the room, it does not lead it. */}
      <header className="relative z-20 flex h-[54px] shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#08080a]/70 px-4 backdrop-blur-xl sm:h-[58px] sm:px-7">
        <Link
          href="/"
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

        <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          <span className="hidden items-center gap-1.5 sm:flex">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-[#86c9a4] shadow-[0_0_8px_rgba(134,201,164,0.65)]"
            />
            private access
          </span>
          <span className="hidden h-3 w-px bg-white/10 sm:block" aria-hidden />
          <span className="tabular-nums text-white/70">
            <LiveClock />
          </span>
          <span className="text-white/30">wib</span>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col lg:min-h-0">
        {/* Astra on a phone: a short band, cropped above the chin, with the name kept small.
            It fades into the page so the form never looks like it sits under a photo. */}
        <section
          aria-hidden
          className="relative h-[168px] shrink-0 overflow-hidden border-b border-white/[0.06] sm:h-[192px] md:h-[224px] lg:hidden"
        >
          <Image
            src="/astra.webp"
            alt=""
            width={736}
            height={563}
            priority
            sizes="100vw"
            className="a-hero-img h-full w-full select-none object-cover object-[52%_44%] grayscale"
          />
          <span
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_top,#08080a_2%,rgba(8,8,10,0.55)_38%,rgba(8,8,10,0.05)_78%)]"
          />
          <span
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(120%_100%_at_70%_0%,transparent_35%,rgba(8,8,10,0.6)_100%)]"
          />
          <span className="a-hero-scan" aria-hidden />
          <p className="absolute bottom-3 left-5 font-mono text-[9.5px] uppercase tracking-[0.3em] text-white/60">
            astra
          </p>
          <p className="absolute bottom-3 right-5 font-mono text-[9.5px] uppercase tracking-[0.3em] text-white/30">
            ai agent
          </p>
        </section>

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(392px,44%)]">
          {/* Desktop: the artwork gets the left half, full bleed, and the form gets a
              column deliberately narrower than the space it sits in. */}
          <section className="relative hidden overflow-hidden border-r border-white/[0.06] lg:block">
            <Image
              src="/astra.webp"
              alt="Astra, the character Aomi is named alongside"
              width={736}
              height={563}
              priority
              sizes="56vw"
              className="a-hero-img h-full w-full select-none object-cover object-[54%_38%] grayscale"
            />
            <span
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(to_top,#08080a_0%,rgba(8,8,10,0.72)_26%,rgba(8,8,10,0.08)_62%,rgba(8,8,10,0.35)_100%)]"
            />
            <span
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(90%_80%_at_76%_18%,transparent_30%,rgba(8,8,10,0.55)_100%)]"
            />
            <span className="a-hero-scan" aria-hidden />

            <div className="absolute inset-x-0 bottom-0 p-9 xl:p-12">
              <div className="a-rise max-w-[34ch]" style={{ "--i": 3 } as React.CSSProperties}>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.34em] text-white/50">character</p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.34em] text-white/90">astra</p>
                <p className="mt-4 text-[13.5px] leading-relaxed text-white/50">
                  An agent with a face, a workspace, and files that are really yours.
                </p>
                <span aria-hidden className="a-rule mt-6 block w-24" />
                <p className="mt-4 font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/50">
                  {tools.length} tools · 8h session · csp
                </p>
              </div>
            </div>
          </section>

          {/* The form column. On a phone it starts right under the band; on a desk it is
              centred in the remaining half, at a measure you can read without turning. */}
          <section className="flex flex-1 items-start px-5 pb-9 pt-7 sm:px-8 sm:pt-9 lg:items-center lg:px-12 lg:py-14 xl:px-16">
            <div className="mx-auto w-full max-w-[420px] lg:mx-0">
              <p
                className="a-rise font-mono text-[9.5px] uppercase tracking-[0.34em] text-white/50"
                style={{ "--i": 0 } as React.CSSProperties}
              >
                ai agent × astra
              </p>

              <h1
                className="a-rise mt-3.5 text-[27px] font-medium leading-[1.1] tracking-[-0.03em] text-white sm:text-[32px]"
                style={{ "--i": 1 } as React.CSSProperties}
              >
                Sign in to workspace
              </h1>

              <p
                className="a-rise mt-2.5 text-[13.5px] leading-relaxed text-white/55"
                style={{ "--i": 2 } as React.CSSProperties}
              >
                Welcome back. Ready when you are.
              </p>

              {note ? (
                <p
                  className="a-rise mt-4 flex items-start gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-[12px] leading-relaxed text-white/60"
                  style={{ "--i": 3 } as React.CSSProperties}
                  role="status"
                >
                  <span aria-hidden className="mt-[6px] size-1.5 shrink-0 rounded-full bg-white/40" />
                  <span>
                    {note}{" "}
                    <Link href="/buy" className="font-medium text-white/80 underline decoration-white/20 underline-offset-4 hover:text-white hover:decoration-white/60">
                      Beli akses
                    </Link>
                  </span>
                </p>
              ) : null}

              <div className="a-rise mt-7" style={{ "--i": 3 } as React.CSSProperties}>
                <LoginForm
                  next={next}
                  whatsapp={ownerWhatsApp(state)}
                  configured={Boolean(state.config)}
                  priceLabel={`Rp${accessPriceIdr().toLocaleString("id-ID")}`}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      <footer className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/50 sm:px-7">
        <p>httponly cookie · 8h session</p>
        <p className="hidden sm:block">aomi studio — private access</p>
      </footer>
    </main>
  );
}
