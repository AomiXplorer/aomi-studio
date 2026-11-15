"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, AudioLines, Bot, Code2, FolderTree, Globe2 } from "lucide-react";
import type { CSSProperties } from "react";

const reveal = (index = 0) => ({ "--land-delay": `${index * 60}ms` }) as CSSProperties;

/**
 * The explanation, held to one side with room to breathe.
 *
 * No section numbers, no rules, no monospace lists: two short paragraphs that say
 * what the product is and what happens after the first sentence.
 */
export function LandingAbout() {
  return (
    <section id="about" className="land-anchor relative z-10" aria-labelledby="about-title">
      <div className="mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-32">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
          <h2
            id="about-title"
            data-reveal
            className="land-reveal max-w-[16ch] text-[32px] font-semibold leading-[1.06] tracking-[-0.03em] text-white sm:text-[42px] lg:text-[46px]"
          >
            More than just an AI.
          </h2>

          <div data-reveal style={reveal(1)} className="land-reveal max-w-[54ch] lg:pt-2">
            <p className="text-[16.5px] leading-[1.7] text-white/75 sm:text-[18px]">
              Aomi is a workspace where you describe what you want and Astra builds it: real pages, real files, kept
              in a project you can open again tomorrow.
            </p>
            <p className="mt-5 text-[15px] leading-[1.72] text-white/50 sm:text-[16px]">
              There is no blank canvas and nothing to install. Type a sentence, and the first draft is already on
              screen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    id: "agent",
    title: "AI Agent",
    body: "Astra reads the project before it writes, and explains each change it makes.",
    icon: Bot,
    span: "lg:col-span-2",
    lead: true,
  },
  {
    id: "web",
    title: "Web Creation",
    body: "Describe a site and get the pages, styles and files.",
    icon: Globe2,
    span: "",
    lead: false,
  },
  {
    id: "code",
    title: "AI Coding",
    body: "Refactor, review and debug in the same conversation.",
    icon: Code2,
    span: "",
    lead: false,
  },
  {
    id: "workspace",
    title: "Workspace",
    body: "Projects, a file tree and an editor that stay where you left them.",
    icon: FolderTree,
    span: "",
    lead: false,
  },
  {
    id: "studio",
    title: "Image & Audio",
    body: "Generate artwork and voice, saved next to the project.",
    icon: AudioLines,
    span: "",
    lead: false,
  },
] as const;

/**
 * Five capabilities as cards with an icon, a name and one line each. The lead card
 * runs wide so the grid is not a row of equals; every name here ships today.
 */
export function LandingFeatures({ tools }: { tools: string[] }) {
  return (
    <section id="features" className="land-anchor relative z-10" aria-labelledby="features-title">
      <div className="mx-auto w-full max-w-[1240px] px-5 pb-20 sm:px-8 sm:pb-28 lg:px-10 lg:pb-32">
        <div className="max-w-[46ch]" data-reveal>
          <h2
            id="features-title"
            className="land-reveal text-[32px] font-semibold leading-[1.06] tracking-[-0.03em] text-white sm:text-[42px] lg:text-[46px]"
          >
            What you can make.
          </h2>
          <p className="land-reveal mt-4 text-[15px] leading-[1.7] text-white/50 sm:text-[16px]">
            Everything below runs in your workspace today.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:mt-16 lg:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.id}
                data-reveal
                style={reveal(index % 3)}
                className={`land-reveal land-card group flex flex-col rounded-xl p-6 sm:p-7 ${feature.span} ${
                  feature.lead ? "land-card-lead" : ""
                }`}
              >
                <span aria-hidden className="land-card-icon">
                  <Icon className="size-[18px]" strokeWidth={1.6} />
                </span>

                <h3 className="mt-6 text-[17px] font-semibold tracking-[-0.015em] text-white">{feature.title}</h3>
                <p className="mt-2 max-w-[38ch] text-[14px] leading-[1.65] text-white/50">{feature.body}</p>

                {feature.lead ? (
                  <p className="mt-auto pt-8 text-[13.5px] text-white/50">
                    {tools.length} tools, one conversation. No plugins to install.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { id: "01", title: "Describe it", body: "Say what you want in plain words. A sentence is enough to start." },
  { id: "02", title: "Astra builds it", body: "It plans, writes the files and shows you every change as it happens." },
  { id: "03", title: "Keep it", body: "Edit by hand, keep going, or export the whole project as a ZIP." },
] as const;

/** Three steps as an editorial list beside the heading, not another card grid. */
export function LandingProcess() {
  return (
    <section id="how" className="land-anchor relative z-10" aria-labelledby="how-title">
      <div className="mx-auto w-full max-w-[1240px] px-5 pb-20 sm:px-8 sm:pb-28 lg:px-10 lg:pb-32">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
          <div data-reveal>
            <h2
              id="how-title"
              className="land-reveal max-w-[20ch] text-[32px] font-semibold leading-[1.06] tracking-[-0.03em] text-white sm:text-[42px] lg:text-[46px]"
            >
              Three steps, then it is yours.
            </h2>
          </div>

          <ol className="space-y-9 sm:space-y-10">
            {STEPS.map((step, index) => (
              <li key={step.id} data-reveal style={reveal(index)} className="land-reveal flex gap-5 sm:gap-7">
                <span className="mt-1 text-[13px] font-medium tabular-nums text-white/30">{step.id}</span>
                <div>
                  <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-white">{step.title}</h3>
                  <p className="mt-2 max-w-[42ch] text-[14.5px] leading-[1.65] text-white/50">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** The closing band: Astra behind a soft mask, one sentence, one button. */
export function LandingClosing({ authed, priceLabel }: { authed: boolean; priceLabel: string }) {
  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="closing-title">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] md:block" aria-hidden>
        <Image
          src="/astra.webp"
          alt=""
          fill
          loading="lazy"
          sizes="46vw"
          className="land-cta-art object-cover object-[44%_40%] grayscale"
        />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-56 right-0 hidden size-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.05),transparent_70%)] blur-2xl md:block"
      />

      <div className="relative z-10 mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-32">
        <div className="max-w-[540px]" data-reveal>
          <h2
            id="closing-title"
            className="land-reveal text-[32px] font-semibold leading-[1.06] tracking-[-0.03em] text-white sm:text-[44px] lg:text-[50px]"
          >
            Your next project starts with a sentence.
          </h2>
          <p className="land-reveal mt-4 text-[15.5px] leading-[1.7] text-white/55 sm:text-[17px]">
            Open the workspace and tell Astra what to build.
          </p>

          <div className="land-reveal mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
            <Link
              href={authed ? "/chat" : "/login"}
              className="land-cta group inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-lg px-7 text-[15px] font-semibold tracking-[-0.01em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
            >
              {authed ? "Open workspace" : "Get Started"}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </Link>

            <Link
              href="/buy"
              className="land-link group inline-flex h-[52px] items-center gap-1.5 text-[14.5px] font-medium text-white/65 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
            >
              <span className="land-link-line">Buy access — {priceLabel}</span>
              <ArrowUpRight className="size-4 text-white/40 transition-colors duration-150 group-hover:text-white/80" aria-hidden />
            </Link>
          </div>

          <p className="land-reveal mt-7 text-[13px] text-white/40">The workspace opens after you sign in.</p>
        </div>
      </div>
    </section>
  );
}

/** Footer: brand, the three doors worth opening, and the year. */
export function LandingFooter({ authed }: { authed: boolean }) {
  return (
    <footer className="relative z-10">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-5 pb-10 pt-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 self-start" aria-label="Aomi Studio, back to top">
          <span
            aria-hidden
            className="grid size-[26px] place-items-center rounded-[7px] border border-white/15 bg-white/[0.04] text-[12.5px] font-semibold leading-none text-white/90"
          >
            a
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/60">aomi studio</span>
        </Link>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[13.5px] text-white/55">
          <Link href={authed ? "/chat" : "/login"} className="transition-colors duration-150 hover:text-white">
            {authed ? "Workspace" : "Sign in"}
          </Link>
          <Link href="/buy" className="transition-colors duration-150 hover:text-white">
            Buy access
          </Link>
          <a href="#top" className="transition-colors duration-150 hover:text-white">
            Back to top
          </a>
        </nav>

        <p className="text-[12.5px] text-white/50">© 2026 Aomi Studio</p>
      </div>
    </footer>
  );
}
