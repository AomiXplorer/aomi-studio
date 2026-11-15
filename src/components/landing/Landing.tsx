"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LandingHero } from "./Hero";
import { LandingAbout, LandingClosing, LandingFeatures, LandingFooter, LandingProcess } from "./Sections";

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
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 },
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
      const offset = Math.min(window.scrollY, 820) * 0.055;
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
      {/* Light only: the printed grid texture that suits the gate reads as a HUD here. */}
      <div className="a-glow" aria-hidden />

      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-1.5 focus:text-[13px] focus:font-medium focus:text-[#09090b]"
      >
        Skip to content
      </a>

      {/* Nav: brand and a door. No clock, no status lamp, no second navigation. */}
      <header className="sticky top-0 z-40 bg-[#08080a]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-[60px] w-full max-w-[1240px] items-center justify-between gap-3 px-5 sm:h-[68px] sm:px-8 lg:px-10">
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            <span
              aria-hidden
              className="grid size-[26px] place-items-center rounded-[7px] border border-white/15 bg-white/[0.04] text-[12.5px] font-semibold leading-none text-white/90 transition-colors duration-200 group-hover:border-white/30 group-hover:text-white"
            >
              a
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/70 transition-colors duration-200 group-hover:text-white">
              aomi studio
            </span>
          </Link>

          <div className="flex items-center gap-5">
            <Link
              href={authed ? "/chat" : "/login"}
              className="text-[13.5px] font-medium text-white/60 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
            >
              {authed ? "Workspace" : "Sign in"}
            </Link>

            {authed ? null : (
              <Link
                href="/buy"
                className="rounded-lg border border-white/15 px-4 py-2.5 text-[13.5px] font-medium text-white/90 transition-colors duration-200 hover:border-white/35 hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
              >
                Get access
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="content" lang="en">
        <LandingHero authed={authed} tools={tools.length} priceLabel={priceLabel} />
        <LandingAbout />
        <LandingFeatures tools={tools} />
        <LandingProcess />
        <LandingClosing authed={authed} priceLabel={priceLabel} />
      </main>

      <LandingFooter authed={authed} />
    </div>
  );
}
