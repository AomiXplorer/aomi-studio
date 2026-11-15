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
 * The headline is capped at 48px so it reads as a title rather than a poster, and
 * the block underneath it is three short lines plus one action.
 */
export function LandingHero({ authed, priceLabel }: { authed: boolean; priceLabel: string }) {
  const start = authed ? "/chat" : "/login";
  const stage = (index: number) => ({ "--i": index } as CSSProperties);

  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
      {/* Desk: the artwork owns the right side and dissolves into the page. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] lg:block" aria-hidden>
        <div className="land-parallax absolute -inset-[5%]">
          <Image
            src="/astra-hero.webp"
            alt=""
            fill
            priority
            unoptimized
            className="a-hero-img bg-[#0b0b0e] object-cover object-[46%_40%] grayscale"
          />
        </div>
        <span className="absolute inset-0 bg-[linear-gradient(to_right,#08080a_0%,rgba(8,8,10,0.94)_16%,rgba(8,8,10,0.58)_46%,rgba(8,8,10,0.12)_78%,rgba(8,8,10,0.36)_100%)]" />
        <span className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#08080a] to-transparent" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1120px] px-5 sm:px-6 lg:px-8">
        {/* Phone: a short band, fading into the page instead of ending on a rule. */}
        <div
          aria-hidden
          className="relative -mx-5 mt-3 h-[176px] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_56%,transparent)] sm:-mx-6 sm:h-[210px] lg:hidden"
        >
          <div className="land-parallax absolute -inset-[7%]">
            <Image
              src="/astra-hero.webp"
              alt=""
              fill
              priority
              unoptimized
              className="a-hero-img bg-[#0b0b0e] object-cover object-[48%_36%] grayscale"
            />
          </div>
        </div>

        <div className="grid items-center gap-8 pb-16 pt-7 sm:pb-20 sm:pt-9 lg:min-h-[540px] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10 lg:pb-24 lg:pt-16">
          <div className="max-w-[500px]">
            <p className="land-eyebrow a-rise" style={stage(0)}>
              ai agent × astra
            </p>

            <h1 id="hero-title" className="land-display a-rise mt-4 text-white" style={stage(1)}>
              Meet Aomi.
            </h1>

            <p className="land-lead a-rise mt-3 text-white/85" style={stage(2)}>
              Your personal AI workspace.
            </p>

            <p className="land-body a-rise mt-3 max-w-[42ch]" style={stage(3)}>
              Build websites, create projects, and bring ideas to life with Astra.
            </p>

            <div
              className="a-rise mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-5"
              style={stage(4)}
            >
              <Link
                href={start}
                className="land-cta group inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[14px] font-semibold tracking-[-0.005em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
              >
                {authed ? "Open workspace" : "Get Started"}
                <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
              </Link>

              <a
                href="#features"
                className="land-link inline-flex h-11 items-center justify-center gap-1.5 text-[13.5px] font-medium text-white/55 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70 sm:justify-start"
              >
                <span className="land-link-line">See what it builds</span>
              </a>
            </div>

            <p className="land-meta a-rise mt-6" style={stage(5)}>
              One-time access · {priceLabel}
            </p>
          </div>

          {/* The desk composition leaves this column to the artwork on purpose. */}
          <div className="hidden lg:block" aria-hidden />
        </div>
      </div>
    </section>
  );
}
