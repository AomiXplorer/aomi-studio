"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LiveClock } from "@/components/auth/LiveClock";
import { LandingHero } from "./Hero";
import { LandingAbout, LandingClosing, LandingFacts, LandingFeatures, LandingFooter, LandingProcess } from "./Sections";

/**
 * The public front door.
 *
 * Three jobs beyond the copy: reveal sections as they arrive, give the hero art a
 * few pixels of parallax, and swap the way in for "Open workspace" when a valid
 * session already exists. All of it is one IntersectionObserver and one passive
 * scroll listener, and none of it runs when the visitor asked for reduced motion.
 */
export function Landing({ tools, priceLabel }: { tools: string[]; priceLabel: string }) {
  const room = useRef<HTMLDivElement>(null);
  const [authed, setAuthed] = useState(false);

  // The page itself is static so it can be cached at the edge; the answer to "is
  // this person already inside?" is asked once, quietly, from the browser.
  useEffect(() => {
    let alive = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => {
        if (alive && response.ok) setAuthed(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const root = room.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || typeof IntersectionObserver === "undefined") {
      targets.forEach((node) => node.setAttribute("data-seen", "true"));
      return;
    }

    // Armed only once the observer exists, so a script failure leaves the page readable.
    root.setAttribute("data-land-reveal", "on");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-seen", "true");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    targets.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = room.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const shift = () => {
      frame = 0;
      // Capped: past the first screen the artwork has left anyway.
      const offset = Math.min(window.scrollY, 820) * 0.06;
      root.style.setProperty("--land-shift", `${offset.toFixed(2)}px`);
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(shift);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    shift();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--land-shift");
    };
  }, []);

  return (
    <div id="top" ref={room} className="a-room land-room relative min-h-dvh overflow-x-clip">
      <div className="a-glow" aria-hidden />
      <div className="a-grain" aria-hidden />

      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-1.5 focus:text-[13px] focus:font-medium focus:text-[#09090b]"
      >
        Skip to content
      </a>

      {/* Nav: brand, one status line, one door. It frames the page, it does not lead it. */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#08080a]/72 backdrop-blur-xl">
        <div className="mx-auto flex h-[54px] w-full max-w-[1340px] items-center justify-between gap-3 px-5 sm:h-[58px] sm:px-8 lg:px-12">
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

          <div className="flex items-center gap-3 sm:gap-4">
            <span className="hidden font-mono text-[9.5px] uppercase tracking-[0.26em] text-white/55 md:inline">
              ai agent × astra
            </span>
            <span aria-hidden className="hidden h-3 w-px bg-white/10 md:block" />
            <span className="hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55 sm:flex">
              <span aria-hidden className="size-1.5 rounded-full bg-[#86c9a4] shadow-[0_0_8px_rgba(134,201,164,0.55)]" />
              <LiveClock />
              <span className="text-white/50">wib</span>
            </span>

            <Link
              href={authed ? "/chat" : "/login"}
              className="rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium text-white/85 transition-colors duration-200 hover:border-white/30 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
            >
              {authed ? "Workspace" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      <main id="content" lang="en">
        <LandingHero authed={authed} tools={tools.length} priceLabel={priceLabel} />
        <LandingFacts tools={tools.length} priceLabel={priceLabel} />
        <LandingAbout />
        <LandingFeatures tools={tools} />
        <LandingProcess />
        <LandingClosing authed={authed} priceLabel={priceLabel} />
      </main>

      <LandingFooter authed={authed} />
    </div>
  );
}
