#!/usr/bin/env node
/**
 * End-to-end checks for the purchase flow, against a running local server and the three
 * mocks. Every assertion talks HTTP to the real routes: nothing is imported from src, so a
 * green run means the deployed behaviour works, not that a helper compiles.
 *
 * Usage (see scripts/qa/README.md for the full stack):
 *   BASE=http://127.0.0.1:3104 node scripts/qa/payments-check.mjs
 */
import { createHmac } from "node:crypto";

const BASE = process.env.BASE || "http://127.0.0.1:3104";
const REDIS = process.env.REDIS_BASE || "http://127.0.0.1:6391";
const AUSTIN = process.env.AUSTIN_BASE || "http://127.0.0.1:6392";
const MAIL = process.env.MAIL_BASE || "http://127.0.0.1:6394";
const WEBHOOK_SECRET = process.env.AUSTINPAY_WEBHOOK_SECRET || "qa-webhook-secret";
const OWNER_USER = process.env.OWNER_USER || "owner";
const OWNER_PASS = process.env.OWNER_PASS || "owner-qa-password-123";
const RUN = Date.now().toString(36);

const results = [];
let failures = 0;

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function check(name, condition, detail) {
  record(name, Boolean(condition), condition ? "" : detail);
}

async function http(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: "manual" });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text, headers: response.headers };
}

function post(url, body, cookie) {
  return http(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function cookiesFrom(response) {
  const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  return raw.map((line) => line.split(";")[0]).join("; ");
}

async function mailInbox() {
  const response = await fetch(process.env.MAIL_INBOX_URL || `${MAIL}/messages`);
  const data = await response.json();
  return Array.isArray(data) ? data : (data.messages || []);
}

async function austinState() {
  const response = await fetch(`${AUSTIN}/_qa/state`);
  return response.json();
}

async function dumpStore() {
  const response = await fetch(`${REDIS}/_qa/dump`);
  return (await response.json()).dump || {};
}

/** RFC 2047 encoded words, as nodemailer writes the subject. */
function decodeSubject(value) {
  // Whitespace between two adjacent encoded words is not part of the text.
  return String(value || "").replace(/\?=\s+=\?/g, "?==?").replace(/=\?UTF-8\?([QB])\?([^?]*)\?=/gi, (_, kind, payload) => {
    if (kind.toUpperCase() === "B") return Buffer.from(payload, "base64").toString("utf8");
    return Buffer.from(payload.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__, hex) => String.fromCharCode(parseInt(hex, 16))), "binary").toString("utf8");
  });
}

/** Quoted-printable, including soft line breaks, which is what the body uses. */
function decodeQuotedPrintable(input) {
  const joined = String(input || "").replace(/=\r?\n/g, "");
  const bytes = [];
  for (let index = 0; index < joined.length; index += 1) {
    if (joined[index] === "=" && /^[0-9A-F]{2}$/i.test(joined.slice(index + 1, index + 3))) {
      bytes.push(parseInt(joined.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(joined.charCodeAt(index) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

const stamp = RUN.slice(-5).toUpperCase();
const buyerEmail = `qa.buyer.${RUN}@example.test`;
const buyerName = `qabuyer${stamp}`.slice(0, 24).toLowerCase();
const secondEmail = `qa.second.${RUN}@example.test`;
const secondName = `qasecond${stamp}`.slice(0, 24).toLowerCase();

let ownerCookie = "";
let buyerCookie = "";
let firstOrder = null;
let firstToken = "";
let firstPassword = "";

async function main() {
  // Each run starts from empty storage and an empty inbox so the rate limits and the
  // "one account" assertions mean the same thing every time.
  await fetch(`${REDIS}/_qa/reset`, { method: "POST" }).catch(() => undefined);
  await fetch(`${MAIL}/reset`, { method: "POST" }).catch(() => undefined);

  // ---------------------------------------------------------------- scenario 1
  const buyPage = await http(`${BASE}/buy`);
  check(
    "1. /buy tampil dengan dua langkah dan tombol Buy",
    buyPage.status === 200 && buyPage.text.includes("Let&#x27;s get started") && buyPage.text.includes("Continue"),
    `status ${buyPage.status}`,
  );
  const loginPage = await http(`${BASE}/login`);
  check(
    "1b. halaman login menampilkan opsi Buy Access",
    loginPage.status === 200 && /buy access/i.test(loginPage.text),
    `status ${loginPage.status}`,
  );

  // ---------------------------------------------------------------- scenario 2
  const badEmail = await post(`${BASE}/api/purchase/check-email`, { email: "bukan-email" });
  check("2. email format salah ditolak", badEmail.status === 400, `status ${badEmail.status}`);

  const emptyEmail = await post(`${BASE}/api/purchase/check-email`, { email: "" });
  check("2b. email kosong ditolak", emptyEmail.status === 400, `status ${emptyEmail.status}`);

  const goodEmail = await post(`${BASE}/api/purchase/check-email`, { email: buyerEmail });
  check("2c. email valid diterima", goodEmail.status === 200, `status ${goodEmail.status}: ${goodEmail.text.slice(0, 120)}`);

  // ---------------------------------------------------------------- scenario 3
  const ownerCookieResponse = await post(`${BASE}/api/auth/login`, { username: OWNER_USER, password: OWNER_PASS });
  ownerCookie = cookiesFrom(ownerCookieResponse);
  const baselineDump = await dumpStore();
  const baselineUsers = Object.keys(baselineDump).filter((key) => key.startsWith("aomi:user:")).length;
  check("3. owner bisa login", ownerCookieResponse.status === 200 && Boolean(ownerCookie), `status ${ownerCookieResponse.status}`);

  const duplicateName = await post(`${BASE}/api/purchase/check-username`, { username: OWNER_USER });
  check("3b. username owner ditolak untuk pembeli", duplicateName.status === 409, `status ${duplicateName.status}`);

  const shortName = await post(`${BASE}/api/purchase/check-username`, { username: "ab" });
  check("3c. username terlalu pendek ditolak", shortName.status === 409, `status ${shortName.status}`);

  const freeName = await post(`${BASE}/api/purchase/check-username`, { username: buyerName });
  check("3d. username bebas diterima", freeName.status === 200, `status ${freeName.status}: ${freeName.text.slice(0, 120)}`);

  // ---------------------------------------------------------------- scenario 4
  const create = await post(`${BASE}/api/purchase/order`, { email: buyerEmail, username: buyerName });
  firstOrder = create.json?.order || null;
  firstToken = create.json?.token || "";
  check("4. order + QRIS dibuat", create.status === 200 && firstOrder?.qrImage?.startsWith("data:image/"), `status ${create.status}: ${create.text.slice(0, 160)}`);
  check("4b. nominal dari provider dipakai", firstOrder?.payableAmount > 0 && Boolean(firstOrder?.transactionId), `payable ${firstOrder?.payableAmount}, tx ${firstOrder?.transactionId}`);
  check("4c. order punya expiry", Boolean(firstOrder?.expiresAt && Date.parse(firstOrder.expiresAt) > Date.now()), firstOrder?.expiresAt);

  const reused = await post(`${BASE}/api/purchase/order`, { email: buyerEmail, username: buyerName });
  check(
    "4d. klik ulang memakai QRIS yang sama (bukan bikin baru)",
    reused.json?.order?.transactionId === firstOrder?.transactionId,
    `${reused.json?.order?.transactionId} vs ${firstOrder?.transactionId}`,
  );
  const staleToken = await http(`${BASE}/api/purchase/order/${firstOrder.id}?t=${firstToken}`);
  check("4e. token lama mati setelah link pembayaran diperbarui", staleToken.status === 404, `status ${staleToken.status}`);
  firstToken = reused.json?.token || firstToken;

  // ---------------------------------------------------------------- scenario 5
  const wrongToken = await http(`${BASE}/api/purchase/order/${firstOrder.id}?t=salah`);
  check("5. token salah tidak membuka order", wrongToken.status === 404, `status ${wrongToken.status}`);

  const pendingStatus = await http(`${BASE}/api/purchase/order/${firstOrder.id}?t=${firstToken}`);
  check(
    "5b. status pending tidak membuat akun",
    pendingStatus.status === 200 && pendingStatus.json?.order?.status === "pending" && pendingStatus.json?.ready === false,
    JSON.stringify(pendingStatus.json?.order?.status),
  );

  let dump = await dumpStore();
  const userKeysAfterPending = Object.keys(dump).filter((key) => key.startsWith("aomi:user:"));
  check(
    "5c. belum ada user baru sebelum dibayar",
    userKeysAfterPending.length === baselineUsers,
    `${userKeysAfterPending.length} vs baseline ${baselineUsers}`,
  );

  // ---------------------------------------------------------------- scenario 6
  const body = JSON.stringify({ event: "deposit.paid", data: { transactionId: firstOrder.transactionId, amount: firstOrder.payableAmount } });
  const badSignature = await http(`${BASE}/webhook/austinpay`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-austinpay-signature": "deadbeef" },
    body,
  });
  check("6. signature salah ditolak 401", badSignature.status === 401, `status ${badSignature.status}`);

  const noSignature = await http(`${BASE}/webhook/austinpay`, { method: "POST", headers: { "content-type": "application/json" }, body });
  check("6b. tanpa signature ditolak 401", noSignature.status === 401, `status ${noSignature.status}`);

  dump = await dumpStore();
  const orderRowAfterBad = dump[`aomi:order:${firstOrder.id}`] || {};
  check("6c. order tetap pending setelah webhook palsu", orderRowAfterBad.status === "pending", String(orderRowAfterBad.status));

  // ---------------------------------------------------------------- scenario 7
  const payQa = await post(`${AUSTIN}/_qa/pay`, { transactionId: firstOrder.transactionId });
  check("7. provider mock menandai transaksi dibayar", payQa.json?.success === true, JSON.stringify(payQa.json).slice(0, 120));

  const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const paidHook = await http(`${BASE}/webhook/austinpay`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-austinpay-signature": signature },
    body,
  });
  check(
    "7b. webhook paid diterima dan akun dibuat",
    paidHook.status === 200 && (paidHook.json?.settled === "paid" || paidHook.json?.settled === "already"),
    JSON.stringify(paidHook.json).slice(0, 160),
  );

  // The email is sent after the response; give the waitUntil a moment to finish.
  let inbox = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    inbox = await mailInbox();
    if (inbox.some((mail) => String(mail.to).includes(buyerEmail))) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const buyerMail = inbox.find((mail) => String(mail.to).includes(buyerEmail));
  check("7c. email kredensial terkirim ke pembeli", Boolean(buyerMail), `${inbox.length} pesan di inbox mock`);
  const subject = decodeSubject(buyerMail?.subject);
  check("7d. subject email sesuai", subject === "Welcome to Aomi — Your Account Is Ready!", subject || "(kosong)");

  const rawMail = buyerMail?.raw ? decodeQuotedPrintable(buyerMail.raw) : "";
  const passwordMatch = rawMail.match(/Password:\s*([A-Za-z0-9-]+)/) || rawMail.match(/>\s*(Aomi-[A-Za-z0-9-]{4}-[A-Za-z0-9-]{4}-[A-Za-z0-9-]{4})\s*</);
  firstPassword = passwordMatch ? passwordMatch[1].trim() : "";
  check("7e. password ada di email dan kuat", /^Aomi-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(firstPassword), firstPassword ? "format ok" : rawMail.slice(0, 200));

  check("7j. email memuat username dan link login", rawMail.includes(buyerName) && rawMail.includes("/login"), "isi email");
  check(
    "7k. email meminta ganti password setelah login pertama",
    /change your password after your first login/i.test(rawMail),
    "kalimat keamanan",
  );

  const buyerLogin = await post(`${BASE}/api/auth/login`, { username: buyerName, password: firstPassword });
  buyerCookie = cookiesFrom(buyerLogin);
  check("7f. akun pembeli bisa login dengan password dari email", buyerLogin.status === 200 && Boolean(buyerCookie), `status ${buyerLogin.status}`);

  dump = await dumpStore();
  const userKeys = Object.keys(dump).filter((key) => key.startsWith("aomi:user:"));
  const userRow = userKeys.map((key) => dump[key]).find((row) => row?.username === buyerName) || {};
  check("7g. akun tersimpan dengan role user aktif", userRow.role === "user" && userRow.status === "active", `${userRow.role}/${userRow.status}`);
  check("7h. password di database berupa hash bcrypt", String(userRow.passwordHash || "").startsWith("$2"), String(userRow.passwordHash || "").slice(0, 6));

  const rawDump = JSON.stringify(dump);
  check("7i. password plaintext tidak tersimpan di database", firstPassword && !rawDump.includes(firstPassword), "tidak ditemukan");

  // ---------------------------------------------------------------- scenario 8
  const duplicateHook = await http(`${BASE}/webhook/austinpay`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-austinpay-signature": signature },
    body,
  });
  const inboxAfterDuplicate = await mailInbox();
  dump = await dumpStore();
  const usersAfterDuplicate = Object.keys(dump).filter((key) => key.startsWith("aomi:user:"));
  check("8. webhook dobel tidak membuat akun kedua", usersAfterDuplicate.length === userKeys.length, `${usersAfterDuplicate.length} vs ${userKeys.length}`);
  check(
    "8b. webhook dobel tidak mengirim email kedua",
    inboxAfterDuplicate.filter((mail) => String(mail.to).includes(buyerEmail)).length === 1,
    `${inboxAfterDuplicate.length} pesan total`,
  );
  check("8c. webhook dobel dijawab tanpa error", duplicateHook.status === 200 && duplicateHook.json?.settled === "already", JSON.stringify(duplicateHook.json).slice(0, 120));

  // ---------------------------------------------------------------- scenario 9
  const second = await post(`${BASE}/api/purchase/order`, { email: secondEmail, username: secondName });
  const secondToken = second.json?.token || "";
  const secondOrder = second.json?.order || null;
  check("9. order kedua bisa dibuat", second.status === 200 && Boolean(secondOrder), `status ${second.status}`);

  const cancel = await post(`${BASE}/api/purchase/order/${secondOrder.id}/cancel?t=${secondToken}`, {});
  check("9b. pembayaran bisa dibatalkan", cancel.status === 200 && cancel.json?.order?.status === "cancelled", JSON.stringify(cancel.json?.order?.status));

  dump = await dumpStore();
  const cancelledRow = dump[`aomi:order:${secondOrder.id}`] || {};
  const usersAfterCancel = Object.keys(dump).filter((key) => key.startsWith("aomi:user:"));
  check(
    "9c. order batal tidak membuat akun",
    cancelledRow.status === "cancelled" && usersAfterCancel.length === baselineUsers + 1,
    `${cancelledRow.status}, ${usersAfterCancel.length} user`,
  );

  // ---------------------------------------------------------------- scenario 10
  const thirdEmail = `qa.third.${RUN}@example.test`;
  const third = await post(`${BASE}/api/purchase/order`, { email: thirdEmail, username: `qathird${stamp}`.slice(0, 24) });
  const thirdOrder = third.json?.order || null;
  const thirdToken = third.json?.token || "";
  check("10. order ketiga bisa dibuat", third.status === 200 && Boolean(thirdOrder), `status ${third.status}`);

  await post(`${AUSTIN}/_qa/expire`, { transactionId: thirdOrder.transactionId });
  const expiredPoll = await http(`${BASE}/api/purchase/order/${thirdOrder.id}?t=${thirdToken}`);
  dump = await dumpStore();
  const expiredRow = dump[`aomi:order:${thirdOrder.id}`] || {};
  const usersAfterExpire = Object.keys(dump).filter((key) => key.startsWith("aomi:user:"));
  check(
    "10b. status expired tidak membuat akun",
    usersAfterExpire.length === baselineUsers + 1,
    `${usersAfterExpire.length} user, status ${expiredPoll.json?.order?.status || expiredRow.status}`,
  );

  // ---------------------------------------------------------------- scenario 11
  const blocked = await http(`${BASE}/api/admin/overview`, { headers: { cookie: buyerCookie } });
  check("11. user biasa tidak bisa membuka API owner", blocked.status === 403, `status ${blocked.status}`);

  const paymentsAsUser = await http(`${BASE}/api/admin/payments`, { headers: { cookie: buyerCookie } });
  check("11b. user biasa tidak bisa melihat daftar pembayaran", paymentsAsUser.status === 403, `status ${paymentsAsUser.status}`);

  // ---------------------------------------------------------------- scenario 12
  const adminPayments = await http(`${BASE}/api/admin/payments`, { headers: { cookie: ownerCookie } });
  check(
    "12. owner bisa membuka Payment Management",
    adminPayments.status === 200 && Array.isArray(adminPayments.json?.orders) && adminPayments.json.orders.length >= 3,
    `status ${adminPayments.status}, ${adminPayments.json?.orders?.length} order`,
  );
  check(
    "12b. statistik pembayaran terhitung",
    adminPayments.json?.stats?.paid >= 1 && adminPayments.json?.stats?.users >= baselineUsers + 1,
    JSON.stringify(adminPayments.json?.stats),
  );

  const retry = await post(`${BASE}/api/admin/payments/action`, { action: "retryProvision", orderId: firstOrder.id }, ownerCookie);
  check("12c. retry provisioning aman (tidak bikin akun baru)", retry.status === 200 && retry.json?.state === "already", JSON.stringify(retry.json).slice(0, 140));

  const resend = await post(`${BASE}/api/admin/payments/action`, { action: "retryEmail", orderId: firstOrder.id }, ownerCookie);
  check("12d. owner bisa mengirim ulang email", resend.status === 200 && resend.json?.ok === true, JSON.stringify(resend.json).slice(0, 140));

  const probe = await post(`${BASE}/api/admin/payments/action`, { action: "probeProvider" }, ownerCookie);
  check("12e. probe kredensial provider berhasil (1 request)", probe.status === 200 && probe.json?.account?.username === "aomi-qa", JSON.stringify(probe.json).slice(0, 140));

  // ---------------------------------------------------------------- extras
  const health = await http(`${BASE}/api/health`);
  check("13. health check tetap normal", health.status === 200, `status ${health.status}`);

  const authedPage = await http(`${BASE}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "hi" }) });
  check("13b. endpoint chat tetap menolak tanpa sesi", authedPage.status === 401 || authedPage.status === 403, `status ${authedPage.status}`);

  const austin = await austinState();
  check("13c. mock provider menerima request bertanda tangan", austin.deposits.length >= 3, `${austin.deposits.length} deposit`);

  console.log("");
  console.log(`${results.length - failures}/${results.length} checks passed`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("HARNESS ERROR", error);
  process.exitCode = 1;
});
