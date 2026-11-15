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
 * Tokens are single use, so `round` is the way a caller asks for a fresh challenge: after
 * a wrong password the widget is torn down and rendered again, instead of submitting a
 * token Cloudflare has already spent. With no site key the component renders nothing and
 * the form behaves exactly as it did before the challenge existed.
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
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");

  useEffect(() => {
    deliver.current = onToken;
  }, [onToken]);

  const mount = useCallback(() => {
    if (!host.current || !window.turnstile) return;
    if (widget.current) {
      try {
        window.turnstile.remove(widget.current);
      } catch {
        /* the widget is already gone */
      }
      widget.current = null;
    }
    widget.current = window.turnstile.render(host.current, {
      sitekey: siteKey,
      theme: "dark",
      size: "flexible",
      appearance: "always",
      callback: (token: string) => deliver.current(token),
      "expired-callback": () => deliver.current(null),
      "error-callback": () => {
        setState("failed");
        deliver.current(null);
      },
    });
    setState("ready");
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey) return;
    setState("loading");
    if (window.turnstile) {
      mount();
      return () => {
        if (widget.current && window.turnstile) {
          try {
            window.turnstile.remove(widget.current);
          } catch {
            /* already removed */
          }
          widget.current = null;
        }
      };
    }

    const script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    const onLoad = () => mount();
    const onError = () => setState("failed");
    if (script) {
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
    } else {
      const created = document.createElement("script");
      created.src = SCRIPT_SRC;
      created.async = true;
      created.defer = true;
      created.dataset.turnstile = "1";
      created.addEventListener("load", onLoad, { once: true });
      created.addEventListener("error", onError, { once: true });
      document.head.appendChild(created);
    }
    return () => {
      script?.removeEventListener("load", onLoad);
      script?.removeEventListener("error", onError);
      if (widget.current && window.turnstile) {
        try {
          window.turnstile.remove(widget.current);
        } catch {
          /* already removed */
        }
        widget.current = null;
      }
    };
  }, [mount, round, siteKey]);

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
          {state === "ready" ? "diverifikasi cloudflare turnstile" : "memuat verifikasi"}
        </p>
      )}
    </div>
  );
}
