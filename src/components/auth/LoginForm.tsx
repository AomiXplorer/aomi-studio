"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Turnstile } from "./Turnstile";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LogIn,
  MessageCircle,
  Sparkles,
  UserRound,
} from "lucide-react";

/** Only ever redirects inside this site: `//evil.com` and absolute URLs are refused. */
function safeNext(raw: string | undefined): string {
  // "/" is the public introduction now, so a plain sign-in lands in the workspace.
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/chat";
  return raw;
}

type Stage = "idle" | "pending" | "success";

/**
 * The sign-in, written as a product and not as a console. Two equal ways in sit
 * on one switch; the fields are ordinary boxes that warm up on focus; the result
 * of a try appears once, under the button, in a colour that means something.
 * Everything the browser needs (labels, autocomplete, aria-invalid, a live
 * region) is still here — the redesign is skin and motion, not new auth logic.
 */
export function LoginForm({
  next,
  whatsapp,
  configured,
  priceLabel,
  turnstileSiteKey = "",
}: {
  next?: string;
  whatsapp: string;
  configured: boolean;
  priceLabel: string;
  turnstileSiteKey?: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [shake, setShake] = useState(0);
  // A challenge token is spent by the first attempt, so a retry needs a new widget round.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);

  const takeToken = useCallback((token: string | null) => setCaptchaToken(token), []);

  const destination = safeNext(next);
  const pending = stage === "pending";
  const granted = stage === "success";
  const invalid = Boolean(error);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || granted) return;
    setError(null);
    setStage("pending");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          turnstileSiteKey ? { username, password, turnstileToken: captchaToken || "" } : { username, password },
        ),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) {
        const said = payload?.error?.message || "";
        // An unsolved challenge is not a wrong password: keep what was typed and just ask
        // for the verification, so an early click never costs the owner their typing.
        const challenge = response.status === 400 && /verification/i.test(said);
        setError(
          challenge
            ? said
            : response.status === 429
              ? said || "Too many attempts. Try again in a moment."
              : said || "Incorrect username or password.",
        );
        if (!challenge) setPassword("");
        setShake((value) => value + 1);
        setStage("idle");
        if (turnstileSiteKey) {
          setCaptchaToken(null);
          setCaptchaRound((value) => value + 1);
        }
        return;
      }
      // A beat of confirmation before the room changes: the button is the only
      // thing that reports success, so it is worth seeing it happen.
      setStage("success");
      setTimeout(() => {
        router.replace(destination);
        router.refresh();
      }, 420);
    } catch {
      setError("Cannot reach the server. Check your connection and try again.");
      setShake((value) => value + 1);
      setStage("idle");
    }
  }

  return (
    <form onSubmit={submit} noValidate className="w-full">
      {/* Two ways in, one thumb. Equal halves, equal height, no clipped label: the
          price lives on its own line under the words, so nothing has to truncate. */}
      <div
        className="a-switch relative grid grid-cols-2 gap-1 rounded-[11px] border border-white/[0.08] bg-white/[0.02] p-1"
        role="group"
        aria-label="Sign in or buy access"
      >
        <span
          aria-hidden
          className="a-switch-thumb pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-[8px] bg-white/[0.075] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.35)]"
        />
        <span
          aria-current="page"
          className="a-switch-tab relative z-10 flex h-[52px] flex-col items-center justify-center rounded-[8px] text-white"
        >
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium leading-none">
            <LogIn className="size-3.5 text-white/60" aria-hidden />
            Sign in
          </span>
          <span className="mt-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.18em] text-white/50">
            workspace
          </span>
        </span>
        <Link
          href="/buy"
          className="a-switch-tab group relative z-10 flex h-[52px] flex-col items-center justify-center rounded-[8px] text-white/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-inset"
        >
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium leading-none">
            <Sparkles className="size-3.5 text-white/35 transition-colors duration-200 group-hover:text-white/80" aria-hidden />
            Buy access
          </span>
          <span className="mt-1.5 font-mono text-[9px] uppercase leading-none tracking-[0.18em] text-white/55 transition-colors duration-200 group-hover:text-white/75">
            {priceLabel}
          </span>
        </Link>
      </div>

      <div
        className={`mt-5 space-y-4 ${shake ? "a-shake" : ""}`}
        onAnimationEnd={() => setShake(0)}
      >
        <div className="a-field" data-invalid={invalid}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor="username" className="text-[12px] font-medium tracking-[-0.01em] text-white/70">
              Username
            </label>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/20" aria-hidden>
              id
            </span>
          </div>
          <div className="a-input">
            <UserRound className="size-4 shrink-0 text-white/25" aria-hidden />
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
              aria-invalid={invalid}
              aria-describedby={error ? "login-error" : undefined}
              placeholder="your username"
            />
          </div>
        </div>

        <div className="a-field" data-invalid={invalid}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor="password" className="text-[12px] font-medium tracking-[-0.01em] text-white/70">
              Password
            </label>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/20" aria-hidden>
              secret
            </span>
          </div>
          <div className="a-input">
            <input
              id="password"
              name="password"
              type={reveal ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              enterKeyHint="go"
              required
              aria-invalid={invalid}
              aria-describedby={error ? "login-error" : undefined}
              placeholder="your password"
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? "Hide password" : "Show password"}
              aria-pressed={reveal}
              className="-mr-2 grid size-10 shrink-0 place-items-center rounded-md text-white/30 transition-colors duration-150 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
        </div>
      </div>

      {turnstileSiteKey ? <Turnstile siteKey={turnstileSiteKey} onToken={takeToken} round={captchaRound} /> : null}

      <button
        type="submit"
        data-busy={pending}
        disabled={pending || granted || !username.trim() || !password}
        className="a-submit mt-5 flex h-12 w-full items-center justify-center gap-2 bg-[#fafafa] text-[13.5px] font-semibold tracking-[-0.01em] text-[#09090b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/55"
      >
        {granted ? (
          <>
            <Check className="a-check size-4" aria-hidden />
            Access granted
          </>
        ) : pending ? (
          <>
            <span className="a-spin" aria-hidden />
            Signing in
          </>
        ) : (
          <>
            Sign in
            <ArrowRight className="a-submit-arrow size-4" aria-hidden />
          </>
        )}
      </button>

      {/* One place for the result. It reserves its height so the button never jumps
          away from the thumb that is about to tap it again. */}
      <div aria-live="polite" className="mt-3 min-h-[40px]">
        {error ? (
          <p id="login-error" role="alert" className="flex items-start gap-2 text-[12px] leading-relaxed text-[#e58f8f]">
            <AlertCircle className="mt-[2px] size-3.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : granted ? (
          <p className="flex items-center gap-2 text-[12px] leading-relaxed text-[#86c9a4]">
            <Check className="size-3.5" aria-hidden />
            Opening your workspace…
          </p>
        ) : (
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-white/50">
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${pending ? "animate-pulse bg-white/70" : "bg-white/25"}`}
            />
            {pending ? "verifying credentials" : "ready when you are"}
          </p>
        )}
      </div>

      {!configured ? (
        <p className="mt-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-[11.5px] leading-relaxed text-white/55">
          The server has no credential source yet. Set the private repo or{" "}
          <code className="rounded-sm bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-white/80">AOMI_AUTH_JSON</code>{" "}
          in Vercel.
        </p>
      ) : null}

      <div className="mt-6">
        <span aria-hidden className="a-rule block" />
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
          <p className="text-[11.5px] leading-relaxed text-white/55">Owner access only. Forgot the password?</p>
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("Hi, I would like to request access to Aomi Studio.")}`}
            target="_blank"
            rel="noreferrer noopener"
            className="group inline-flex items-center gap-1.5 text-[11.5px] font-medium text-white/65 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080a]"
          >
            <MessageCircle className="size-3.5 text-white/30 transition-colors duration-150 group-hover:text-white/70" aria-hidden />
            Ask on WhatsApp
            <span className="font-mono text-[10px] tracking-[0.04em] text-white/45">+{whatsapp}</span>
          </a>
        </div>
      </div>
    </form>
  );
}
