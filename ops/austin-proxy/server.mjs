#!/usr/bin/env node
/**
 * AustinPay relay for hosts whose egress IP changes.
 *
 * Vercel functions leave through a rotating pool of AWS addresses, and AustinPay only
 * answers whitelisted ones. This tiny relay is meant to run on a machine with one fixed
 * public IP: Aomi calls the relay, the relay calls AustinPay, and the only address AustinPay
 * ever sees is that machine's.
 *
 * It adds nothing else. No credentials are stored here: the API key and the HMAC signature
 * arrive per request and are forwarded untouched, so a compromise of this box does not hand
 * over a key that is not already in the request it is proxying.
 *
 *   PROXY_TOKEN   shared secret Aomi sends in x-proxy-token (required, 24+ chars)
 *   AUSTIN_BASE   upstream, default https://austinstore.id
 *   PORT          default 8787
 *   HOST          default 127.0.0.1 (put nginx/caddy in front for TLS)
 *   ALLOW_HOSTS   comma separated extra hostnames, optional
 */
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { URL } from "node:url";

const TOKEN = (process.env.PROXY_TOKEN || "").trim();
const BASE = (process.env.AUSTIN_BASE || "https://austinstore.id").replace(/\/+$/, "");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";

// Only these paths are relayed: a stolen token cannot be turned into a general proxy.
const ALLOWED = [/^\/api\/account(\?.*)?$/, /^\/api\/deposit\/[A-Za-z0-9/_-]*(\?.*)?$/];
const FORWARD_HEADERS = ["content-type", "accept", "user-agent", "x-api-key", "x-timestamp", "x-signature"];

if (TOKEN.length < 24) {
  console.error("PROXY_TOKEN wajib diisi, minimal 24 karakter.");
  process.exit(1);
}

function tokenOk(value) {
  const supplied = Buffer.from(String(value || "").trim(), "utf8");
  const expected = Buffer.from(TOKEN, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function log(line) {
  console.log(`${new Date().toISOString()} ${line}`);
}

const server = createServer((incoming, outgoing) => {
  const started = Date.now();
  if (!tokenOk(incoming.headers["x-proxy-token"])) {
    outgoing.writeHead(401, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: "token tidak valid" }));
    log(`401 ${incoming.method} ${incoming.url}`);
    return;
  }

  const path = incoming.url || "/";
  if (!ALLOWED.some((pattern) => pattern.test(path))) {
    outgoing.writeHead(403, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: "path tidak diizinkan" }));
    log(`403 ${incoming.method} ${path}`);
    return;
  }

  const chunks = [];
  incoming.on("data", (chunk) => chunks.push(chunk));
  incoming.on("end", () => {
    const body = Buffer.concat(chunks);
    const headers = {};
    for (const name of FORWARD_HEADERS) {
      const value = incoming.headers[name];
      if (value) headers[name] = value;
    }
    if (body.length) headers["content-length"] = String(body.length);

    const target = new URL(BASE + path);
    const send = target.protocol === "http:" ? httpRequest : httpsRequest;
    const upstream = send(
      {
        method: incoming.method,
        hostname: target.hostname,
        port: target.port || (target.protocol === "http:" ? 80 : 443),
        path: `${target.pathname}${target.search}`,
        headers,
        timeout: 25_000,
      },
      (answer) => {
        outgoing.writeHead(answer.statusCode || 502, {
          "content-type": answer.headers["content-type"] || "application/json",
          "cache-control": "no-store",
        });
        answer.pipe(outgoing);
        log(`${answer.statusCode} ${incoming.method} ${path} ${Date.now() - started}ms`);
      },
    );

    upstream.on("timeout", () => upstream.destroy(new Error("timeout")));
    upstream.on("error", (error) => {
      if (!outgoing.headersSent) {
        outgoing.writeHead(502, { "content-type": "application/json" });
        outgoing.end(JSON.stringify({ error: `relay gagal: ${error.message}` }));
      }
      log(`502 ${incoming.method} ${path} ${error.message}`);
    });

    if (body.length) upstream.write(body);
    upstream.end();
  });
});

server.listen(PORT, HOST, () => {
  log(`austinpay relay siap di http://${HOST}:${PORT} → ${BASE}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
