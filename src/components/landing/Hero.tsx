"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";

/**
 * The first screen: four lines of type, one button, and Astra.
 *
 * On a desk the artwork holds the right half and fades into the words through a
 * mask, so nothing is boxed. On a phone it becomes a short band above the headline
 * with a soft bottom edge, which keeps the button inside the first screen at every
 * width without cropping the character mid-face.
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
      {/* The only light on the page that is not type: a wide, low glow behind Astra. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 hidden size-[720px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.055),transparent_72%)] blur-2xl lg:block"
      />

      {/* Desk: the artwork owns the right side and dissolves into the page. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[53%] lg:block" aria-hidden>
        <div className="land-parallax absolute -inset-[6%]">
          <Image
            src="/astra-hero.webp"
            alt=""
            fill
            priority
            unoptimized
            className="a-hero-img bg-[#0b0b0e] object-cover object-[46%_40%] grayscale"
          />
        </div>
        <span className="absolute inset-0 bg-[linear-gradient(to_right,#08080a_0%,rgba(8,8,10,0.96)_18%,rgba(8,8,10,0.62)_44%,rgba(8,8,10,0.15)_72%,rgba(8,8,10,0.3)_100%)]" />
        <span className="absolute inset-0 bg-[linear-gradient(to_top,#08080a_0%,transparent_30%,transparent_74%,rgba(8,8,10,0.55)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-10">
        {/* Phone: a short band, fading into the page instead of ending on a rule. */}
        <div
          aria-hidden
          className="relative -mx-5 mt-2 h-[218px] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_62%,transparent)] sm:-mx-8 sm:h-[260px] lg:hidden"
        >
          <div className="land-parallax absolute -inset-[8%]">
            <Image
              src="/astra-hero.webp"
              alt=""
              fill
              priority
              unoptimized
              className="a-hero-img bg-[#0b0b0e] object-cover object-[48%_34%] grayscale"
            />
          </div>
          <span className="absolute inset-0 bg-[radial-gradient(120%_110%_at_64%_20%,transparent_30%,rgba(8,8,10,0.55)_100%)]" />
        </div>

        <div className="grid items-center gap-10 pb-16 pt-6 sm:pt-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:gap-6 lg:pb-24 lg:pt-24">
          <div className="max-w-[600px]">
            <p
              className="a-rise font-mono text-[10px] uppercase tracking-[0.28em] text-white/45"
              style={stage(0)}
            >
              ai agent × astra
            </p>

            <h1
              id="hero-title"
              className="a-rise mt-5 text-[46px] font-semibold leading-[0.98] tracking-[-0.035em] text-white sm:text-[64px] lg:text-[78px] xl:text-[86px]"
              style={stage(1)}
            >
              Meet Aomi.
            </h1>

            <p
              className="a-rise mt-4 text-[20px] font-medium leading-[1.3] tracking-[-0.02em] text-white/90 sm:text-[24px] lg:text-[26px]"
              style={stage(2)}
            >
              Your personal AI workspace.
            </p>

            <p
              className="a-rise mt-4 max-w-[44ch] text-[15.5px] leading-[1.65] text-white/55 sm:text-[16.5px]"
              style={stage(3)}
            >
              Build websites, create projects, and bring your ideas to life with Astra.
            </p>

            <div className="a-rise mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5" style={stage(4)}>
              <Link
                href={start}
                className="land-cta group inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-lg px-7 text-[15px] font-semibold tracking-[-0.01em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
              >
                {authed ? "Open workspace" : "Get Started"}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>

              <a
                href="#features"
                className="land-link inline-flex h-[52px] items-center gap-1.5 text-[14.5px] font-medium text-white/65 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
              >
                <span className="land-link-line">See what it builds</span>
              </a>
            </div>

            <p className="a-rise mt-7 text-[13px] text-white/50" style={stage(5)}>
              One-time access · {priceLabel} · {tools} tools in your workspace
            </p>
          </div>

          {/* The desk composition leaves this column to the artwork on purpose. */}
          <div className="hidden lg:block" aria-hidden />
        </div>
      </div>
    </section>
  );
}
