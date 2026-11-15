"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, AudioLines, Bot, Code2, FolderTree, Globe2 } from "lucide-react";
import type { CSSProperties } from "react";

const reveal = (index = 0) => ({ "--land-delay": `${index * 70}ms` }) as CSSProperties;

/** Shared section label: number on the left, name on the right, one hairline. */
function SectionMark({ index, label }: { index: string; label: string }) {
  return (
    <p className="flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-[0.32em] text-white/55">
      <span className="text-white/70">{index}</span>
      <span aria-hidden className="h-px w-6 bg-white/20" />
      {label}
    </p>
  );
}

/**
 * Four facts, all of them checkable, in place of a testimonial wall: the tools are
 * read from the registry, the price from the catalogue, the rest from the pages that
 * already ship. Nothing here is a roadmap.
 */
export function LandingFacts({ tools, priceLabel }: { tools: number; priceLabel: string }) {
  const facts = [
    { value: `${tools}`, label: "agent tools" },
    { value: "1", label: "workspace" },
    { value: "zip", label: "export" },
    { value: priceLabel, label: "one-time access" },
  ];

  return (
    <section aria-label="What is inside" className="relative z-10 border-y border-white/[0.06] bg-white/[0.012]">
      <dl className="mx-auto grid w-full max-w-[1340px] grid-cols-2 gap-y-5 px-5 py-5 sm:px-8 sm:grid-cols-4 lg:px-12">
        {facts.map((fact, index) => (
          <div
            key={fact.label}
            data-reveal
            style={reveal(index)}
            className={`land-reveal flex flex-col gap-1 ${index > 0 ? "sm:border-l sm:border-white/[0.07] sm:pl-5" : ""}`}
          >
            <dt className="sr-only">{fact.label}</dt>
            <dd className="font-mono text-[13px] uppercase tracking-[0.06em] text-white/85">{fact.value}</dd>
            <dd className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/55">{fact.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The explanation. Heading held to one side, the reading column to the other. */
export function LandingAbout() {
  return (
    <section id="about" className="land-anchor relative z-10" aria-labelledby="about-title">
      <div className="mx-auto w-full max-w-[1340px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-16">
          <div data-reveal className="land-reveal">
            <SectionMark index="002" label="about" />
            <h2
              id="about-title"
              className="mt-5 max-w-[15ch] text-[30px] font-medium leading-[1.08] tracking-[-0.035em] text-white sm:text-[38px] lg:text-[42px]"
            >
              More Than Just an AI.
            </h2>
            <p className="mt-6 max-w-[34ch] font-mono text-[9.5px] uppercase leading-[1.9] tracking-[0.22em] text-white/55">
              one workspace
              <br />
              one conversation
              <br />
              real files
            </p>
          </div>

          <div data-reveal style={reveal(1)} className="land-reveal max-w-[58ch] lg:pt-9">
            <p className="text-[15px] leading-[1.78] text-white/75 sm:text-[16.5px]">
              Aomi is your creative workspace, designed to transform ideas into real projects through intelligent AI
              assistance.
            </p>
            <p className="mt-5 text-[14px] leading-[1.8] text-white/50 sm:text-[15px]">
              Tell it what you want to make. It writes into a project you can open, reads the files back, and keeps
              every change in the same place, so tomorrow starts where tonight stopped.
            </p>
            <p className="mt-5 text-[14px] leading-[1.8] text-white/50 sm:text-[15px]">
              There is no blank canvas to set up and nothing to install. Describe the thing, and the first draft is
              already on screen, in files that are yours to keep.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    id: "01",
    title: "AI Agent",
    body: "An assistant that reads the project, writes the file and runs the step. It keeps the whole thread, so the next answer already knows what the last one built.",
    icon: Bot,
    span: "lg:col-span-5 lg:row-span-2",
    lead: true,
  },
  {
    id: "02",
    title: "Web Creation",
    body: "Describe the site you want. Aomi scaffolds the pages, the styles and the files, then hands you every line.",
    icon: Globe2,
    span: "lg:col-span-4",
    lead: false,
  },
  {
    id: "03",
    title: "AI Coding",
    body: "Create, refactor, review and debug in the same conversation. Each change is a real file, not a snippet in a bubble.",
    icon: Code2,
    span: "lg:col-span-3",
    lead: false,
  },
  {
    id: "04",
    title: "Workspace",
    body: "Projects, a file tree, an editor and a ZIP at the end. Come back tomorrow and the work is where you left it.",
    icon: FolderTree,
    span: "lg:col-span-3",
    lead: false,
  },
  {
    id: "05",
    title: "Image & Audio Studio",
    body: "Generate stills and voice, then keep them beside the project they belong to.",
    icon: AudioLines,
    span: "lg:col-span-4",
    lead: false,
  },
] as const;

/**
 * Five capabilities, laid out as an uneven sheet rather than a row of equal cards.
 * Only what already runs inside the workspace is named here.
 */
export function LandingFeatures({ tools }: { tools: string[] }) {
  return (
    <section id="features" className="land-anchor relative z-10 border-t border-white/[0.06]" aria-labelledby="features-title">
      <div className="mx-auto w-full max-w-[1340px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between" data-reveal>
          <div className="land-reveal">
            <SectionMark index="003" label="capability" />
            <h2
              id="features-title"
              className="mt-5 max-w-[20ch] text-[30px] font-medium leading-[1.08] tracking-[-0.035em] text-white sm:text-[38px] lg:text-[42px]"
            >
              What Aomi actually does.
            </h2>
          </div>
          <p className="max-w-[34ch] text-[13px] leading-[1.7] text-white/55 sm:text-right">
            Only the parts that are already live in the workspace. No promises about a roadmap.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:mt-12 lg:grid-cols-12 lg:gap-4">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.id}
                data-reveal
                style={reveal(index % 3)}
                className={`land-reveal land-card ${feature.span} flex flex-col border border-white/[0.07] bg-white/[0.014] p-5 sm:p-6 ${
                  feature.lead ? "rounded-xl" : "rounded-lg"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <Icon className="size-[18px] text-white/60" strokeWidth={1.5} aria-hidden />
                  <span className="land-index font-mono text-[9.5px] uppercase tracking-[0.2em] text-white/20" aria-hidden>
                    {feature.id}
                  </span>
                </div>

                <h3 className="mt-5 text-[15px] font-semibold tracking-[-0.015em] text-white">{feature.title}</h3>
                <p className="mt-2 max-w-[42ch] text-[12.5px] leading-[1.72] text-white/50 sm:text-[13px]">
                  {feature.body}
                </p>

                {feature.lead ? (
                  <div className="mt-auto pt-8">
                    <div className="land-hairline" aria-hidden />
                    <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[10px] lowercase tracking-[0.04em] text-white/55 sm:grid-cols-3">
                      {tools.slice(0, 6).map((tool) => (
                        <li key={tool} className="truncate">
                          {tool}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.22em] text-white/50">
                      +{Math.max(tools.length - 6, 0)} more in the registry
                    </p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Three line drawings, one per step: a sheet, a working queue, a finished box. */
function StepGlyph({ step }: { step: "idea" | "work" | "result" }) {
  const common = {
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "size-10 shrink-0 text-white/35",
    "aria-hidden": true,
  };

  if (step === "idea") {
    return (
      <svg {...common}>
        <path d="M9 12h30M9 18h18" />
        <rect x="9" y="26" width="30" height="12" rx="2.5" />
        <path d="M14 32h9" />
        <path d="M33 32h1" />
      </svg>
    );
  }

  if (step === "work") {
    return (
      <svg {...common}>
        <path d="M13 15v20M13 15h6M13 35h6" />
        <path d="M25 15h10M25 24h10M25 33h6" opacity="0.55" />
        <circle cx="21" cy="15" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="21" cy="24" r="1.4" fill="currentColor" stroke="none" opacity="0.6" />
        <circle cx="21" cy="33" r="1.4" fill="currentColor" stroke="none" opacity="0.35" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M13 10h13l9 9v19a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2Z" />
      <path d="M26 10v9h9" />
      <path d="M17 30l4 4 8-8" />
    </svg>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Share your idea",
    body: "Say it in plain words. A sentence, a reference, a rough shape of what you want.",
    glyph: "idea",
  },
  {
    n: "02",
    title: "Let Aomi work",
    body: "It reads, plans and writes, naming each tool as it runs while the files appear.",
    glyph: "work",
  },
  {
    n: "03",
    title: "Get your result",
    body: "Open the project, keep editing by hand, or export everything as a ZIP.",
    glyph: "result",
  },
] as const;

/** The flow as three rows, not three cards: a list you can read in one pass. */
export function LandingProcess() {
  return (
    <section id="how" className="land-anchor relative z-10 border-t border-white/[0.06]" aria-labelledby="how-title">
      <div className="mx-auto w-full max-w-[1340px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div data-reveal className="land-reveal max-w-[38ch]">
          <SectionMark index="004" label="how it works" />
          <h2
            id="how-title"
            className="mt-5 text-[30px] font-medium leading-[1.08] tracking-[-0.035em] text-white sm:text-[38px] lg:text-[42px]"
          >
            Three steps, then it is yours.
          </h2>
        </div>

        <ol className="mt-10 sm:mt-12">
          {STEPS.map((step, index) => (
            <li
              key={step.n}
              data-reveal
              style={reveal(index)}
              className="land-reveal land-step grid grid-cols-[42px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-t border-white/[0.07] py-6 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:py-7"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">{step.n}</span>
              <div>
                <h3 className="text-[16px] font-semibold tracking-[-0.015em] text-white sm:text-[17px]">{step.title}</h3>
                <p className="mt-1.5 max-w-[52ch] text-[12.5px] leading-[1.7] text-white/50 sm:text-[13.5px]">{step.body}</p>
              </div>
              <div className="col-start-2 sm:col-start-3">
                <StepGlyph step={step.glyph} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Closing band. Text to the left, Astra low behind it on glass. */
export function LandingClosing({ authed, priceLabel }: { authed: boolean; priceLabel: string }) {
  return (
    <section className="relative z-10 overflow-hidden border-t border-white/[0.06]" aria-labelledby="closing-title">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] lg:block" aria-hidden>
        <Image
          src="/astra.webp"
          alt=""
          fill
          loading="lazy"
          sizes="46vw"
          className="land-cta-art object-cover object-[52%_30%] grayscale"
        />
        <span className="absolute inset-0 bg-[linear-gradient(to_right,#08080a_0%,rgba(8,8,10,0.55)_38%,rgba(8,8,10,0.2)_100%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-[1340px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-28">
        <div data-reveal className="land-reveal max-w-[560px]">
          <SectionMark index="005" label="access" />
          <h2
            id="closing-title"
            className="mt-5 max-w-[17ch] text-[32px] font-medium leading-[1.06] tracking-[-0.04em] text-white sm:text-[42px] lg:text-[50px]"
          >
            Ready to Create Something Amazing?
          </h2>
          <p className="mt-5 max-w-[42ch] text-[14px] leading-[1.75] text-white/55 sm:text-[15px]">
            Your next big idea starts here. Let Aomi help you bring it to life.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              href={authed ? "/chat" : "/login"}
              className="a-submit flex h-12 items-center justify-center gap-2 bg-[#fafafa] px-6 text-[13.5px] font-semibold tracking-[-0.01em] text-[#09090b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {authed ? "Open workspace" : "Get Started"}
              <ArrowRight className="a-submit-arrow size-4" aria-hidden />
            </Link>

            <Link
              href="/buy"
              className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-white/65 transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
            >
              <span className="land-link-line">Buy access — {priceLabel}</span>
              <ArrowUpRight className="size-3.5 text-white/35 transition-colors duration-150 group-hover:text-white/80" aria-hidden />
            </Link>
          </div>

          <p className="mt-7 border-t border-white/[0.07] pt-5 font-mono text-[9.5px] uppercase leading-[1.9] tracking-[0.2em] text-white/55">
            the workspace opens after you sign in
            <br />
            owner account, or a user account from {priceLabel}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Footer: the last hairline, with the three doors someone might actually want. */
export function LandingFooter({ authed }: { authed: boolean }) {
  return (
    <footer className="relative z-10 border-t border-white/[0.06]">
      <div className="mx-auto flex w-full max-w-[1340px] flex-col gap-5 px-5 py-7 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <Link href="/" className="flex items-center gap-2.5 self-start" aria-label="Aomi Studio, back to top">
          <span
            aria-hidden
            className="relative grid size-[24px] place-items-center rounded-[7px] border border-white/15 bg-white/[0.04] text-[12px] font-semibold leading-none text-white/90"
          >
            a
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.26em] text-white/60">aomi studio</span>
        </Link>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-white/60">
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

        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/50">© 2026 · ai agent × astra · jakarta</p>
      </div>
    </footer>
  );
}
