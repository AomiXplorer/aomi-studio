import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";
import { contentSecurityPolicy, isPublicPath, withSecurityHeaders } from "@/lib/auth/headers";

/**
 * Every request passes through here. Pages redirect to the login screen and API calls
 * get a 401 before they reach a handler, so no route depends on the browser to enforce
 * access. Unauthenticated requests never touch the provider or the workspace code.
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const secret = process.env.AOMI_SESSION_SECRET;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next reads the CSP from the request headers and stamps its own scripts with the nonce.
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy(nonce));

  const isApi = pathname.startsWith("/api/");
  const isPublic = isPublicPath(pathname);

  if (!secret || secret.length < 32) {
    if (isApi) {
      return withSecurityHeaders(
        NextResponse.json({ error: { message: "AOMI_SESSION_SECRET belum diset di server.", code: "not_configured" } }, { status: 503 }),
        nonce,
      );
    }
    // Fail closed on pages too: without a secret no session can be trusted.
    return withSecurityHeaders(
      new NextResponse("Auth belum dikonfigurasi.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }),
      nonce,
    );
  }

  const claims = await readSessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
    secret,
    request.headers.get("user-agent"),
  );

  if (!claims && !isPublic) {
    if (isApi) {
      return withSecurityHeaders(
        NextResponse.json({ error: { message: "Sesi tidak valid. Masuk dulu.", code: "unauthenticated" } }, { status: 401 }),
        nonce,
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const target = `${pathname}${request.nextUrl.search}`;
    if (target && target !== "/") url.searchParams.set("next", target);
    return withSecurityHeaders(NextResponse.redirect(url), nonce);
  }

  // Already signed in: the gate has nothing to ask, so go straight inside. The
  // introduction stays readable at "/" for anyone who lands on it.
  if (claims && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return withSecurityHeaders(NextResponse.redirect(url), nonce);
  }

  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
