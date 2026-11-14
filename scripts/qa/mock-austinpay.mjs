#!/usr/bin/env node
/**
 * A local stand-in for the AustinPay API, mirroring the documented contract closely
 * enough to test our signing, parsing and status handling without spending the real key's
 * rate budget.
 *
 * It verifies `X-API-Key` and the HMAC-SHA256 signature exactly as the docs describe, so a
 * client that signs wrongly fails here too. State changes (paying a QR, expiring it) happen
 * through `/_qa/*`, which exists only in this mock.
 *
 * Usage: node scripts/qa/mock-austinpay.mjs [port] [apiKey] [apiSecret]
 */
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.argv[2] || 6392);
const API_KEY = process.argv[3] || "apg_test_local_key";
const API_SECRET = process.argv[4] || "test-hmac-secret";
const FEE_RATE = 0.004;

const deposits = new Map();
let counter = 1000;

function qrSvg(payload) {
  // A deterministic block pattern: enough to prove an image came back, clearly not a real
  // scannable code, and small enough to inline.
  const cells = 21;
  let seed = 0;
  for (const character of payload) seed = (seed * 31 + character.charCodeAt(0)) % 100000;
  let rects = "";
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      if (seed % 2 === 0) rects += `<rect x="${x * 10}" y="${y * 10}" width="10" height="10"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 210" width="210" height="210"><rect width="210" height="210" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function sign(method, path, body, timestamp) {
  return createHmac("sha256", API_SECRET).update(`${method}\n${path}\n${body}\n${timestamp}`).digest("hex");
}

function verify(request, path, body) {
  if (request.headers["x-api-key"] !== API_KEY) return "API Key tidak valid";
  const timestamp = String(request.headers["x-timestamp"] || "");
  const signature = String(request.headers["x-signature"] || "");
  if (!timestamp || !signature) return "Signature diperlukan";
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) return "Timestamp kedaluwarsa";
  if (sign(request.method, path, body, timestamp) !== signature.toLowerCase()) return "Signature tidak valid";
  return null;
}

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    const path = url.pathname;

    if (path === "/_qa/state") {
      json(response, 200, { deposits: [...deposits.values()], feeRate: FEE_RATE });
      return;
    }
    if (path === "/_qa/pay" || path === "/_qa/expire") {
      const body = raw ? JSON.parse(raw) : {};
      const deposit = deposits.get(String(body.transactionId || ""));
      if (!deposit) {
        json(response, 404, { success: false, message: "Transaksi tidak ditemukan" });
        return;
      }
      deposit.status = path === "/_qa/pay" ? "paid" : "expired";
      if (deposit.status === "paid") deposit.paid_at = new Date().toISOString();
      json(response, 200, { success: true, deposit });
      return;
    }

    const authError = verify(request, path, raw);
    if (authError) {
      json(response, 401, { success: false, message: authError });
      return;
    }

    if (path === "/api/account") {
      json(response, 200, {
        success: true,
        user: { id: "qa-user", username: "aomi-qa", email: "qa@example.test", role: "user", status: "active", wallet: { balance: 150_000 } },
      });
      return;
    }

    if (path === "/api/deposit/create" && request.method === "POST") {
      const body = JSON.parse(raw || "{}");
      const amount = Number(body.amount);
      if (!Number.isInteger(amount) || amount <= 0) {
        json(response, 400, { success: false, message: "amount tidak valid" });
        return;
      }
      counter += 1;
      const transactionId = `APG-${counter}`;
      const fee = Math.round(amount * FEE_RATE);
      const deposit = {
        id: `dep-${counter}`,
        transaction_id: transactionId,
        amount: amount + fee,
        base_amount: amount,
        requested_amount: amount,
        unique_code: 0,
        fee,
        fee_payer: "buyer",
        qr_string: `00020101021226610016ID.CO.SHOPEE.WWW0118${transactionId}`,
        qr_image: qrSvg(transactionId),
        expired_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        status: "pending",
        created_at: new Date().toISOString(),
        paid_at: null,
      };
      deposits.set(transactionId, deposit);
      json(response, 200, { success: true, deposit });
      return;
    }

    if (path.startsWith("/api/deposit/check/")) {
      const transactionId = decodeURIComponent(path.split("/").pop() || "");
      const deposit = deposits.get(transactionId);
      if (!deposit) {
        json(response, 404, { success: false, message: "Transaksi tidak ditemukan" });
        return;
      }
      const messages = {
        paid: "Deposit berhasil! Saldo telah ditambahkan.",
        pending: "Menunggu pembayaran...",
        expired: "QRIS telah kadaluarsa.",
      };
      json(response, 200, { success: true, status: deposit.status, message: messages[deposit.status] || "" });
      return;
    }

    if (path.startsWith("/api/deposit/cancel/")) {
      const transactionId = decodeURIComponent(path.split("/").pop() || "");
      const deposit = deposits.get(transactionId);
      if (!deposit) {
        json(response, 404, { success: false, message: "Transaksi tidak ditemukan" });
        return;
      }
      if (deposit.status !== "pending") {
        json(response, 200, { success: false, message: `Deposit tidak bisa dibatalkan (status: ${deposit.status})` });
        return;
      }
      deposit.status = "cancel";
      json(response, 200, { success: true, status: "cancel", message: "Deposit berhasil dibatalkan" });
      return;
    }

    json(response, 404, { success: false, message: `mock austinpay: ${request.method} ${path} tidak ada` });
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`mock austinpay on http://127.0.0.1:${PORT} (key ${API_KEY})`);
});
