import type { Metadata } from "next";
import Image from "next/image";
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

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  const state = await loadAuthConfig();
  const next = typeof params.next === "string" ? params.next : undefined;

  // Straight from the registry, so the rail can never advertise a tool that does not exist.
  const tools = toolNames();

  return (
    <main lang="en" className="relative flex min-h-dvh flex-col overflow-hidden bg-[#09090b] text-[#fafafa]">
      {/* Astra, kept as a quiet ground so the form stays the loudest thing on screen. */}
      <Image
        src="/astra.webp"
        alt=""
        aria-hidden
        width={736}
        height={563}
        priority
        className="pointer-events-none absolute -right-16 -top-16 hidden h-[62vh] w-auto select-none opacity-[0.16] [mask-image:linear-gradient(to_bottom_left,black,transparent_72%)] lg:block"
      />

      <header className="sh-enter flex items-center justify-between border-b border-[#1c1c20] px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span
            className="grid size-7 place-items-center border border-[#3a3a3f] text-[13px] font-semibold leading-none"
            aria-hidden
          >
            a
          </span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-[#a1a1aa]">aomi studio</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8b8b96]">
          <span className="hidden items-center gap-2 sm:flex">
            <span className="size-1.5 bg-[#fafafa]" aria-hidden />
            owner session
          </span>
          <span className="hidden text-[#3a3a3f] sm:inline" aria-hidden>
            /
          </span>
          <LiveClock />
          <span className="text-[#8b8b96]">wib</span>
        </div>
      </header>


      {/* Astra on narrow screens: the rail is desktop-only, so the artwork gets its own band. */}
      <div className="relative h-[104px] shrink-0 overflow-hidden border-b border-[#1c1c20] lg:hidden">
        <Image
          src="/astra.webp"
          alt="Astra, the character Aomi is named alongside"
          width={736}
          height={563}
          priority
          sizes="100vw"
          className="h-full w-full select-none object-cover object-[50%_34%] opacity-90 grayscale"
        />
        <span
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,#09090b_0%,rgba(9,9,11,0.12)_58%,rgba(9,9,11,0))]"
        />
        <p className="absolute bottom-2.5 left-5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#e4e4e7]">
          astra
        </p>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex items-center px-5 py-7 sm:px-8 sm:py-10 lg:px-14">
          <div className="w-full max-w-[520px]">
            <p
              className="sh-enter flex items-center gap-1.5 font-mono text-[11px] text-[#8b8b96]"
              style={{ "--sh-delay": "60ms" } as React.CSSProperties}
            >
              ~/aomi
              <span className="text-[#8b8b96]" aria-hidden>
                /
              </span>
              login
              <span className="aomi-caret ml-1" aria-hidden />
            </p>

            <h1
              className="sh-enter mt-5 text-[26px] font-medium leading-[1.15] tracking-[-0.025em] text-[#fafafa] sm:text-[30px]"
              style={{ "--sh-delay": "120ms" } as React.CSSProperties}
            >
              Sign in to workspace
            </h1>
            <p
              className="sh-enter mt-3 font-mono text-[11px] uppercase tracking-[0.3em] text-[#a1a1aa]"
              style={{ "--sh-delay": "180ms" } as React.CSSProperties}
            >
              AI AGENT X ASTRA
            </p>

            <div className="sh-enter mt-9" style={{ "--sh-delay": "260ms" } as React.CSSProperties}>
              <LoginForm
                next={next}
                whatsapp={ownerWhatsApp(state)}
                configured={Boolean(state.config)}
                priceLabel={`Rp${accessPriceIdr().toLocaleString("id-ID")}`}
              />
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 overflow-hidden border-l border-[#1c1c20] lg:flex lg:flex-col" aria-label="Tools the agent can call">
          <div className="relative h-[176px] shrink-0 border-b border-[#1c1c20]">
            <Image
              src="/astra.webp"
              alt="Astra, the character Aomi is named alongside"
              width={736}
              height={563}
              priority
              sizes="300px"
              className="h-full w-full select-none object-cover object-top grayscale"
            />
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_top,#09090b_10%,rgba(9,9,11,0))]"
            />
            <p className="absolute bottom-3 left-5 font-mono text-[10px] uppercase tracking-[0.24em] text-[#e4e4e7]">
              astra
            </p>
          </div>

          <div className="flex items-center justify-between border-b border-[#1c1c20] px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8b96]">agent tools</p>
            <span className="font-mono text-[10px] text-[#8b8b96]">{tools.length}</span>
          </div>

          <div className="sh-ticker relative min-h-0 flex-1 overflow-hidden">
            <ul className="sh-ticker-track absolute inset-x-0 top-0">
              {tools.map((name, index) => (
                <li
                  key={name}
                  className="flex items-baseline justify-between border-b border-[#18181b] px-5 py-[9px] font-mono text-[11px] text-[#a1a1aa]"
                >
                  <span>{name}</span>
                  <span className="text-[#8b8b96]">{String(index + 1).padStart(2, "0")}</span>
                </li>
              ))}
              {tools.map((name, index) => (
                <li
                  key={`${name}-loop`}
                  aria-hidden
                  className="flex items-baseline justify-between border-b border-[#18181b] px-5 py-[9px] font-mono text-[11px] text-[#a1a1aa]"
                >
                  <span>{name}</span>
                  <span className="text-[#8b8b96]">{String(index + 1).padStart(2, "0")}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-[#1c1c20] px-5 py-4">
            <p className="font-mono text-[10px] leading-relaxed text-[#8b8b96]">
              real files
              <br />
              real zip export
            </p>
          </div>
        </aside>
      </div>

      <footer className="sh-enter flex flex-col gap-1.5 border-t border-[#1c1c20] px-5 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8b8b96] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>httponly cookie · 8-hour session · csp</p>
        <p>aomi studio — private access</p>
      </footer>
    </main>
  );
}
