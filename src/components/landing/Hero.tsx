"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";

/**
 * The first screen. Astra bleeds off the right edge on a desk and becomes a short
 * band on a phone, but the words always come before the buttons and the buttons
 * before the fold: nothing here needs a scroll to be understood.
 *
 * The artwork sits inside `.land-parallax`, which reads one CSS variable set by the
 * single scroll listener in `Landing`. No library, no per-frame React render.
 */
export function LandingHero({
  authed,
  tools,
  priceLabel,
}: {
  authed: boolean;
  tools: number;
  priceLabel: string;
}) {
  const start = authed ? "/chat" : "/login";
  const stage = (index: number) => ({ "--i": index } as CSSProperties);

  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
      {/* Desk: the artwork owns the right half of the screen and fades into the text. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[51%] lg:block" aria-hidden>
        <div className="land-parallax absolute -inset-[7%]">
          <Image
            src="/astra.webp"
            alt=""
            fill
            priority
            sizes="60vw"
            className="a-hero-img bg-[#0b0b0e] object-cover object-[52%_38%] grayscale"
          />
        </div>
        <span className="absolute inset-0 bg-[linear-gradient(to_right,#08080a_0%,#08080a_6%,rgba(8,8,10,0.92)_22%,rgba(8,8,10,0.46)_52%,rgba(8,8,10,0.06)_78%,rgba(8,8,10,0.36)_100%)]" />
        <span className="absolute inset-0 bg-[linear-gradient(to_top,#08080a_0%,transparent_26%,transparent_72%,rgba(8,8,10,0.6)_100%)]" />
        <span className="a-hero-scan" />
        <p className="absolute bottom-16 right-12 font-mono text-[9.5px] uppercase tracking-[0.3em] text-white/60 xl:right-16">
          astra
        </p>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1340px] px-5 sm:px-8 lg:px-12">
        {/* Phone: a short band above the words, cropped above the chin, never mid-face. */}
        <div
          className="relative -mx-5 h-[200px] overflow-hidden border-b border-white/[0.06] sm:-mx-8 sm:h-[236px] lg:hidden"
          aria-hidden
        >
          <div className="land-parallax absolute -inset-[8%]">
            <Image
              src="/astra.webp"
              alt=""
              fill
              priority
              sizes="100vw"
              className="a-hero-img bg-[#0b0b0e] object-cover object-[52%_36%] grayscale"
            />
          </div>
          <span className="absolute inset-0 bg-[linear-gradient(to_top,#08080a_4%,rgba(8,8,10,0.55)_42%,rgba(8,8,10,0.06)_80%)]" />
          <span className="absolute inset-0 bg-[radial-gradient(120%_100%_at_70%_0%,transparent_35%,rgba(8,8,10,0.62)_100%)]" />
          <span className="a-hero-scan" />
          <p className="absolute bottom-3 left-5 font-mono text-[9.5px] uppercase tracking-[0.3em] text-white/60">astra</p>
          <p className="absolute bottom-3 right-5 font-mono text-[9.5px] uppercase tracking-[0.3em] text-white/55">ai agent</p>
        </div>

        <div className="grid items-center gap-8 pb-11 pt-9 sm:pt-11 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] lg:gap-8 lg:pb-16 lg:pt-20 xl:pt-24">
          <div className="max-w-[560px]">
            <p
              className="a-rise flex items-center gap-2.5 font-mono text-[9.5px] uppercase tracking-[0.34em] text-white/55"
              style={stage(0)}
            >
              <span aria-hidden className="size-1 rounded-full bg-white/30" />
              ai agent × astra
            </p>

            <h1
              id="hero-title"
              className="a-rise mt-4 text-[38px] font-medium leading-[1.02] tracking-[-0.04em] text-white sm:text-[52px] lg:text-[62px] xl:text-[68px]"
              style={stage(1)}
            >
              <span className="block">Your Ideas.</span>
              <span className="block text-white/45">Our Intelligence.</span>
            </h1>

            <p
              className="a-rise mt-5 max-w-[40ch] text-[14.5px] leading-[1.72] text-white/60 sm:text-[15.5px]"
              style={stage(2)}
            >
              Meet Aomi, your AI-powered creative workspace. Turn your imagination into reality.
            </p>

            <div className="a-rise mt-8 flex flex-wrap items-center gap-x-6 gap-y-4" style={stage(3)}>
              <Link
                href={start}
                className="a-submit flex h-12 items-center justify-center gap-2 bg-[#fafafa] px-6 text-[13.5px] font-semibold tracking-[-0.01em] text-[#09090b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {authed ? "Open workspace" : "Get Started"}
                <ArrowRight className="a-submit-arrow size-4" aria-hidden />
              </Link>

              <a
                href="#features"
                className="land-link group inline-flex items-center gap-1.5 text-[13px] font-medium text-white/70 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
              >
                <span className="land-link-line">Explore Features</span>
                <ArrowDown className="land-link-arrow size-3.5 text-white/40 group-hover:text-white/80" aria-hidden />
              </a>
            </div>

            <p
              className="a-rise mt-6 font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/55"
              style={stage(4)}
            >
              private access · {priceLabel} one-time · {tools} tools
            </p>
          </div>

          {/* The desk composition leaves this column to the artwork on purpose. */}
          <div className="hidden lg:block" aria-hidden />
        </div>

        {/* Fine print along the bottom of the first screen: an index, not a banner. */}
        <div className="hidden items-center justify-between border-t border-white/[0.06] py-4 font-mono text-[9.5px] uppercase tracking-[0.24em] text-white/50 lg:flex">
          <span>01 — introduction</span>
          <span className="flex items-center gap-2 text-white/60">
            <span aria-hidden className="size-1.5 rounded-full bg-[#86c9a4] shadow-[0_0_8px_rgba(134,201,164,0.55)]" />
            workspace online
          </span>
          <span>scroll to read</span>
        </div>
      </div>
    </section>
  );
}
