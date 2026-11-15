#!/usr/bin/env node
/**
 * A stand-in for Cloudflare's /turnstile/v0/siteverify.
 *
 * It answers exactly the way the real endpoint does for the two cases the server cares
 * about: a token it recognises passes, everything else fails. That keeps the sign-in
 * guard testable without a browser, a site key or a network call.
 *
 *   node scripts/qa/mock-turnstile.mjs 6395 qa-turnstile-secret
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] || 6395);
const secret = process.argv[3] || "qa-turnstile-secret";
export const GOOD_TOKEN = "qa-turnstile-good-token";

createServer((request, response) => {
  if (request.method !== "POST" || !request.url?.startsWith("/siteverify")) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ success: false, "error-codes": ["not-found"] }));
    return;
  }

  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    const form = new URLSearchParams(body);
    const ok = form.get("secret") === secret && form.get("response") === GOOD_TOKEN;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify(
        ok
          ? { success: true, challenge_ts: new Date().toISOString(), hostname: "localhost" }
          : { success: false, "error-codes": ["invalid-input-response"] },
      ),
    );
  });
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`turnstile mock on http://127.0.0.1:${port}\n`);
});
