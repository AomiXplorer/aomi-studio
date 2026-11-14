import type { Metadata } from "next";
import { ArrowDown } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { loadAuthConfig, ownerWhatsApp } from "@/lib/auth/config";

export const metadata: Metadata = {
  title: "Masuk — Aomi",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/** The wordmark is split so each glyph can ink itself in on load. */
const WORDMARK = ["a", "o", "m", "i"];

const FACTS = [
  { label: "Agent", value: "19 tool" },
  { label: "Ekspor", value: "ZIP asli" },
  { label: "Model", value: "73" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  const state = await loadAuthConfig();
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <main className="gate flex min-h-dvh flex-col bg-[#09090b] text-[#fafafa]">
      <span className="gate-sweep hidden lg:block" aria-hidden />

      <header className="gate-enter flex items-center justify-between px-6 pt-7 sm:px-10 lg:px-14">
        <div className="flex items-center gap-3">
          <span
            className="grid size-8 place-items-center border border-[#3a3a3f] font-display text-[17px] leading-none text-[#fafafa]"
            aria-hidden
          >
            a
          </span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-[#a1a1aa]">Aomi Studio</span>
        </div>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8b96]">
          <span className="size-1.5 bg-[#fafafa]" aria-hidden />
          Akses terbatas
        </p>
      </header>

      <div className="grid flex-1 items-center gap-12 px-6 py-12 sm:px-10 lg:grid-cols-12 lg:gap-0 lg:px-14 lg:py-0">
        <section className="lg:col-span-7 lg:pr-16">
          <h1 className="font-display text-[clamp(86px,13.5vw,208px)] leading-[0.78] tracking-[-0.045em] text-[#fafafa]">
            <span className="sr-only">aomi</span>
            <span aria-hidden className="flex items-baseline">
              {WORDMARK.map((letter) => (
                <span key={letter} className="gate-letter">
                  {letter}
                </span>
              ))}
              <span className="ml-3 inline-block size-[0.11em] bg-[#52525b]" aria-hidden />
            </span>
          </h1>

          <div className="gate-rule mt-8 h-px w-full bg-[#27272a] lg:mt-10" aria-hidden />

          <p
            className="gate-enter mt-6 max-w-[46ch] text-[13.5px] leading-[1.75] text-[#a1a1aa]"
            style={{ "--gate-delay": "320ms" } as React.CSSProperties}
          >
            Ruang kerja pribadi. Agent menulis file sungguhan di workspace, kamu meninjau diff-nya, lalu mengunduh
            ZIP yang isinya sama persis dengan project.
          </p>

          <dl
            className="gate-enter mt-10 grid max-w-[440px] grid-cols-3 border-t border-[#27272a]"
            style={{ "--gate-delay": "420ms" } as React.CSSProperties}
          >
            {FACTS.map((fact, index) => (
              <div key={fact.label} className={index === 0 ? "py-4 pr-4" : "border-l border-[#27272a] px-4 py-4"}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8b8b96]">{fact.label}</dt>
                <dd className="mt-1.5 text-[13px] tracking-[-0.01em] text-[#fafafa]">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="lg:col-span-5 lg:border-l lg:border-[#27272a] lg:pl-14">
          <div
            className="gate-enter"
            style={{ "--gate-delay": "160ms" } as React.CSSProperties}
          >
            <div className="mb-8 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8b96]">Formulir masuk</p>
              <ArrowDown className="size-3.5 text-[#3a3a3f]" aria-hidden />
            </div>

            <h2 className="font-display text-[34px] leading-[1.05] tracking-[-0.02em] text-[#fafafa]">
              Masuk dengan akun owner
            </h2>
            <p className="mt-2 max-w-[38ch] text-[12.5px] leading-relaxed text-[#8b8b96]">
              Satu akun, satu sesi delapan jam. Semua halaman dan endpoint terkunci tanpa sesi ini.
            </p>

            <div className="mt-9">
              <LoginForm next={next} whatsapp={ownerWhatsApp(state)} configured={Boolean(state.config)} />
            </div>
          </div>
        </section>
      </div>

      <footer className="gate-enter flex flex-col gap-2 border-t border-[#1c1c20] px-6 py-5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8b8b96] sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-14">
        <p>Sesi ditandatangani server · cookie HttpOnly · 8 jam</p>
        <p>Aomi Studio — akses pribadi</p>
      </footer>
    </main>
  );
}
