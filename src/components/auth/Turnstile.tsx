"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "auto" | "light" | "dark";
      size?: "normal" | "compact" | "flexible";
      appearance?: "always" | "execute" | "interaction-only";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * The Cloudflare challenge, kept to one small box under the fields.
 *
 * Tokens are single use, so `round` is how a caller asks for a fresh one: the widget is
 * reset in place rather than torn down and rebuilt, because rebuilding throws away the
 * solved challenge and leaves the form waiting for a token that never arrives. With no
 * site key the component renders nothing and the form behaves as it did before.
 */
export function Turnstile({
  siteKey,
  onToken,
  round = 0,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  round?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const deliver = useRef(onToken);
  const roundSeen = useRef(round);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    deliver.current = onToken;
  }, [onToken]);

  const mount = useCallback(() => {
    if (!host.current || !window.turnstile) return;
    if (widget.current) return;
    widget.current = window.turnstile.render(host.current, {
      sitekey: siteKey,
      theme: "dark",
      size: "flexible",
      appearance: "always",
      callback: (token: string) => {
        setVerified(true);
        deliver.current(token);
      },
      "expired-callback": () => {
        setVerified(false);
        deliver.current(null);
      },
      "error-callback": () => {
        setVerified(false);
        setState("failed");
        deliver.current(null);
      },
    });
    setState("ready");
  }, [siteKey]);

  // Load the API once and render a single widget. Round changes below never rebuild it.
  useEffect(() => {
    if (!siteKey) return;
    setState("loading");
    if (window.turnstile) {
      mount();
      return;
    }

    const created = document.createElement("script");
    created.src = SCRIPT_SRC;
    created.async = true;
    created.defer = true;
    created.dataset.turnstile = "1";
    const onLoad = () => mount();
    const onError = () => setState("failed");
    created.addEventListener("load", onLoad, { once: true });
    created.addEventListener("error", onError, { once: true });
    document.head.appendChild(created);

    return () => {
      created.removeEventListener("load", onLoad);
      created.removeEventListener("error", onError);
    };
  }, [mount, siteKey]);

  // A spent token cannot be reused, so ask the same widget for a new one.
  useEffect(() => {
    if (roundSeen.current === round) return;
    roundSeen.current = round;
    setVerified(false);
    deliver.current(null);
    const id = widget.current;
    if (!id || !window.turnstile) return;
    try {
      window.turnstile.reset(id);
    } catch {
      /* the widget is gone; bring it back */
      widget.current = null;
      mount();
    }
  }, [mount, round]);

  if (!siteKey) return null;

  return (
    <div className="mt-4">
      <div ref={host} className="min-h-[66px]" data-turnstile-host />
      {state === "failed" ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/55">
          Verification could not load. Reload the page, or turn off tracking protection for this site.
        </p>
      ) : (
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">
          {verified ? "diverifikasi cloudflare turnstile" : "memuat verifikasi"}
        </p>
      )}
    </div>
  );
}
