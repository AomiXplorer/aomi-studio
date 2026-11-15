/**
 * Headers applied to every response by the proxy/middleware. The CSP keeps the app
 * working without trusting arbitrary scripts: Next patches its own bundles with the
 * per-request nonce, and inline styles stay allowed because Tailwind and CodeMirror
 * inject them at runtime.
 */
export function contentSecurityPolicy(nonce?: string): string {
  const scriptSrc = nonce ? `'self' 'nonce-${nonce}' 'strict-dynamic'` : "'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function securityHeaders(nonce?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy(nonce),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
    "X-Permitted-Cross-Domain-Policies": "none",
  };
  if (process.env.NODE_ENV === "production") {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}

export function withSecurityHeaders(response: Response, nonce?: string): Response {
  for (const [key, value] of Object.entries(securityHeaders(nonce))) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Paths reachable without a session cookie.
 *
 * /api/telegram/webhook and /api/cron/backup are here because their caller is a machine,
 * not a browser: both authenticate themselves (a Telegram secret token and a cron secret)
 * before they touch anything, and neither of them reads a session.
 */
/**
 * Static files a link preview needs before any session exists.
 *
 * The share card and the artwork are public by definition: they are what WhatsApp and the
 * other unfurlers fetch, and neither contains anything from a user's workspace.
 */
export const PUBLIC_FILES = ["/og-banner.jpg", "/astra.webp", "/icon.svg"] as const;

export const PUBLIC_PATHS = [
  // The introduction is the front door: a visitor has to be able to read what Aomi
  // is before being asked for a password. Everything past it still needs a session.
  "/",
  "/login",
  // The shop front is reachable before someone has an account: that is the whole point of
  // it. Payment state is still protected by a per-order token, never by the session.
  "/buy",
  "/api/purchase",
  // The provider signs this call; the handler verifies the signature itself.
  "/webhook/austinpay",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  "/api/telegram/webhook",
  "/api/cron/backup",
  // Ops probe: the handler compares an OPS_TOKEN in constant time and fails closed without
  // it, because the proxy has no way to read a bearer token.
  "/api/ops/provider",
] as const;

export function isPublicPath(pathname: string): boolean {
  if ((PUBLIC_FILES as readonly string[]).includes(pathname)) return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
