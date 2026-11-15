/**
 * Turnstile, server side.
 *
 * The widget in the browser only proves intent; the assertion that matters is the one
 * Cloudflare signs. Every sign-in that arrives with a token is checked here before the
 * password is looked at, so a wrong password behind a failed challenge never costs a
 * credential comparison.
 *
 * Unset secret means the check is off: local builds, QA runs and the payment suite keep
 * working without keys, and production turns it on by having the secret.
 */
const DEFAULT_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 6_000;

export type TurnstileVerdict =
  | { ok: true }
  | { ok: false; status: number; message: string };

export function turnstileConfigured(): boolean {
  return Boolean((process.env.TURNSTILE_SECRET_KEY || "").trim());
}

export function turnstileSiteKey(): string {
  return (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
}

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<TurnstileVerdict> {
  const secret = (process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) return { ok: true };

  const response = (token || "").trim();
  if (!response) {
    return { ok: false, status: 400, message: "Complete the verification before signing in." };
  }

  const body = new URLSearchParams({ secret, response });
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  try {
    const endpoint = (process.env.TURNSTILE_VERIFY_URL || DEFAULT_VERIFY_URL).trim();
    const result = await fetch(endpoint, {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = (await result.json().catch(() => null)) as { success?: boolean } | null;
    if (payload?.success) return { ok: true };
    return { ok: false, status: 403, message: "Verification failed. Reload the page and try again." };
  } catch {
    return { ok: false, status: 503, message: "Verification is unavailable right now. Try again shortly." };
  }
}
