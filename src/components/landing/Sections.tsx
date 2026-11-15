"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, AudioLines, Bot, Code2, FolderTree, Globe2 } from "lucide-react";
import type { CSSProperties } from "react";

const reveal = (index = 0) => ({ "--land-delay": `${index * 55}ms` }) as CSSProperties;

/**
 * What the product is, in two sentences, held beside its title.
 *
 * The title is deliberately smaller than the hero and slightly larger than the
 * section titles below it: this is the one place the page slows down to say
 * something, so it gets a measure of its own (about 52 characters a line).
 */
export function LandingAbout() {
  return (
    <section id="about" className="land-anchor relative z-10" aria-labelledby="about-title">
      <div className="mx-auto w-full max-w-[1120px] px-5 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          <h2 id="about-title" data-reveal className="land-title land-reveal max-w-[18ch] text-white">
            More than just an AI.
          </h2>

          <div data-reveal style={reveal(1)} className="land-reveal max-w-[54ch]">
            <p className="land-body-lg">
              Aomi is a workspace where you describe what you want and Astra builds it: real pages, real files, kept in
              a project you can reopen tomorrow.
            </p>
            <p className="land-body mt-4">No blank canvas, nothing to install. Type a sentence and the first draft is on screen.</p>
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
    body: "Reads the project before it writes, and explains each change.",
    icon: Bot,
    span: "lg:col-span-2",
  },
  {
    id: "web",
    title: "Web Creation",
    body: "Describe a site and get the pages, styles and files.",
    icon: Globe2,
    span: "",
  },
  {
    id: "code",
    title: "AI Coding",
    body: "Refactor, review and debug in the same conversation.",
    icon: Code2,
    span: "",
  },
  {
    id: "workspace",
    title: "Workspace",
    body: "Projects, a file tree and an editor that wait for you.",
    icon: FolderTree,
    span: "",
  },
  {
    id: "studio",
    title: "Image & Audio",
    body: "Artwork and voice, saved next to the project.",
    icon: AudioLines,
    span: "",
  },
] as const;

/**
 * Five capabilities, each a name, a mark and one line. The lead card runs two
 * columns wide so the grid is not a row of equals; every name here ships today.
 */
export function LandingFeatures({ tools }: { tools: string[] }) {
  return (
    <section id="features" className="land-anchor relative z-10" aria-labelledby="features-title">
      <div className="mx-auto w-full max-w-[1120px] px-5 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <div className="max-w-[54ch]" data-reveal>
          <h2 id="features-title" className="land-title-sm land-reveal text-white">
            What you can make.
          </h2>
          <p className="land-small land-reveal mt-2">
            All of it runs in your workspace today: {tools.length} tools, one conversation.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:mt-10 lg:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.id}
                data-reveal
                style={reveal(index % 3)}
                className={`land-reveal land-card group flex flex-col rounded-lg p-5 sm:p-6 ${feature.span}`}
              >
                <Icon className="land-card-mark size-[18px]" strokeWidth={1.5} aria-hidden />

                <h3 className="land-card-title mt-4 text-white">{feature.title}</h3>
                <p className="mt-1.5 max-w-[34ch] text-[13.5px] leading-[1.55] text-white/50">{feature.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { id: "01", title: "Describe it", body: "A sentence is enough to start." },
  { id: "02", title: "Astra builds it", body: "It plans, writes the files and shows every change." },
  { id: "03", title: "Keep it", body: "Edit by hand, keep going, or export the project as a ZIP." },
] as const;

/** Three steps as a short list beside the heading, not another card grid. */
export function LandingProcess() {
  return (
    <section id="how" className="land-anchor relative z-10" aria-labelledby="how-title">
      <div className="mx-auto w-full max-w-[1120px] px-5 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          <h2 id="how-title" data-reveal className="land-title-xs land-reveal max-w-[20ch] text-white">
            Three steps, then it is yours.
          </h2>

          <ol className="max-w-[46ch] space-y-6">
            {STEPS.map((step, index) => (
              <li key={step.id} data-reveal style={reveal(index)} className="land-reveal flex gap-4 sm:gap-5">
                <span className="mt-[3px] text-[11px] font-medium tabular-nums tracking-[0.06em] text-white/48">
                  {step.id}
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white">{step.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-[1.55] text-white/50">{step.body}</p>
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
          src="/astra-hero.webp"
          alt=""
          fill
          loading="lazy"
          unoptimized
          className="land-cta-art object-cover object-[46%_38%] grayscale"
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1120px] px-5 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <div className="max-w-[520px]" data-reveal>
          <h2 id="closing-title" className="land-title-xl land-reveal text-white">
            Your next project starts with a sentence.
          </h2>
          <p className="land-body land-reveal mt-3">Open the workspace and tell Astra what to build.</p>

          <div className="land-reveal mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-5">
            <Link
              href={authed ? "/chat" : "/login"}
              className="land-cta group inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[14px] font-semibold tracking-[-0.005em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
            >
              {authed ? "Open workspace" : "Get Started"}
              <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
            </Link>

            <Link
              href="/buy"
              className="land-link group inline-flex h-11 items-center justify-center gap-1.5 text-[13.5px] font-medium text-white/55 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70 sm:justify-start"
            >
              <span className="land-link-line">Buy access — {priceLabel}</span>
              <ArrowUpRight className="size-3.5 text-white/35 transition-colors duration-150 group-hover:text-white/80" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Footer: one row of doors and the year. No second brand mark. */
export function LandingFooter({ authed }: { authed: boolean }) {
  return (
    <footer className="relative z-10">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 pb-9 pt-2 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-8">
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/50">
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

        <p className="land-meta">© 2026 Aomi Studio</p>
      </div>
    </footer>
  );
}
