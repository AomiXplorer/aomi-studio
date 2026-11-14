import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { LiveClock } from "@/components/auth/LiveClock";
import { loadAuthConfig, ownerWhatsApp } from "@/lib/auth/config";
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
    <main lang="en" className="flex min-h-dvh flex-col bg-[#09090b] text-[#fafafa]">
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

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex items-center px-5 py-10 sm:px-8 lg:px-14">
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
              <LoginForm next={next} whatsapp={ownerWhatsApp(state)} configured={Boolean(state.config)} />
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 overflow-hidden border-l border-[#1c1c20] lg:flex lg:flex-col" aria-label="Tools the agent can call">
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
