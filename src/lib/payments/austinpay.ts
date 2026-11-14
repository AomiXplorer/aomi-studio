/**
 * AustinPay QRIS client.
 *
 * Every call is signed the way the provider's docs describe: `X-API-Key` plus, when an
 * API secret exists, HMAC-SHA256 over `METHOD\nPATH\nBODY\nTIMESTAMP` with that exact
 * raw body. The signature is computed from the pure pathname, which is why the key is
 * sent as a header and never as `?apikey=` here: the server would otherwise verify a
 * path we did not sign.
 *
 * Nothing in this module reads a price from the caller. The amount always comes from
 * the server-side catalogue, and the provider's answer is the only thing that can mark
 * a deposit as paid.
 */
import { createHmac } from "node:crypto";

const DEFAULT_BASE = "https://austinstore.id";

export class AustinPayError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 502, code = "austinpay_error") {
    super(message);
    this.name = "AustinPayError";
    this.status = status;
    this.code = code;
  }
}

export function austinBaseUrl(): string {
  return (process.env.AUSTINPAY_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

export function austinApiKey(): string {
  return (process.env.AUSTIN_API_KEY || "").trim();
}

export function austinApiSecret(): string {
  return (process.env.AUSTIN_API_SECRET || "").trim();
}

export function webhookSecret(): string {
  return (process.env.AUSTINPAY_WEBHOOK_SECRET || "").trim();
}

export interface AustinConfigState {
  configured: boolean;
  signed: boolean;
  baseUrl: string;
  keyFingerprint: string;
  webhookConfigured: boolean;
  missing: string[];
}

/** What the owner panel is allowed to know: never the key itself. */
export function austinConfigState(): AustinConfigState {
  const missing: string[] = [];
  if (!austinApiKey()) missing.push("AUSTIN_API_KEY");
  if (!austinApiSecret()) missing.push("AUSTIN_API_SECRET");
  if (!webhookSecret()) missing.push("AUSTINPAY_WEBHOOK_SECRET");
  const key = austinApiKey();
  return {
    configured: Boolean(key),
    signed: Boolean(austinApiSecret()),
    baseUrl: austinBaseUrl(),
    keyFingerprint: key ? `****${key.slice(-4)}` : "(belum diset)",
    webhookConfigured: Boolean(webhookSecret()),
    missing,
  };
}

export function signRequest(method: string, path: string, body: string, secret: string, timestamp?: string) {
  const stamp = timestamp || Date.now().toString();
  const payload = `${method.toUpperCase()}\n${path}\n${body}\n${stamp}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return { timestamp: stamp, signature };
}

interface CallOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  /** Abort sooner than the platform timeout so a hung provider cannot stall a webhook. */
  timeoutMs?: number;
}

async function call<T>(options: CallOptions): Promise<T> {
  const apiKey = austinApiKey();
  if (!apiKey) throw new AustinPayError("AustinPay belum dikonfigurasi di server.", 503, "not_configured");

  const secret = austinApiSecret();
  const rawBody = options.body === undefined ? "" : JSON.stringify(options.body);
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-API-Key": apiKey };
  if (secret) {
    const { timestamp, signature } = signRequest(options.method, options.path, rawBody, secret);
    headers["X-Timestamp"] = timestamp;
    headers["X-Signature"] = signature;
  }

  let response: Response;
  try {
    response = await fetch(`${austinBaseUrl()}${options.path}`, {
      method: options.method,
      headers,
      body: options.method === "GET" ? undefined : rawBody,
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
  } catch {
    throw new AustinPayError("Tidak bisa menghubungi AustinPay. Coba lagi sebentar.", 503, "network");
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  const fail = (payload as { message?: string; error?: string } | null)?.message
    || (payload as { error?: string } | null)?.error
    || "";

  // The provider's own wording goes on the end: "IP not whitelisted" and "account
  // suspended" are both 403s, and the difference decides what the owner has to do.
  const providerNote = fail ? ` (AustinPay: ${fail})` : "";

  if (response.status === 401) {
    throw new AustinPayError(`API key AustinPay ditolak. Periksa AUSTIN_API_KEY dan signature.${providerNote}`, 502, "unauthorized");
  }
  if (response.status === 403) {
    throw new AustinPayError(
      `AustinPay menolak request dari server ini: akun diblokir atau IP keluar belum ada di Whitelist IP.${providerNote}`,
      502,
      "forbidden",
    );
  }
  if (response.status === 429) {
    throw new AustinPayError("AustinPay sedang membatasi request (429). Coba lagi beberapa detik lagi.", 429, "rate_limited");
  }
  if (!response.ok) {
    throw new AustinPayError(fail || `AustinPay menjawab ${response.status}.`, 502, "provider_error");
  }
  if (payload && typeof payload === "object" && (payload as { success?: boolean }).success === false) {
    throw new AustinPayError(fail || "AustinPay menolak permintaan.", 400, "rejected");
  }
  return payload as T;
}

export interface AustinDeposit {
  id: string;
  transactionId: string;
  /** What the buyer must pay, fee and unique code included. */
  amount: number;
  baseAmount: number;
  requestedAmount: number;
  uniqueCode: number;
  fee: number;
  feePayer: string;
  qrString: string;
  qrImage: string;
  expiredAt: string;
  status: string;
}

function numberish(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

/**
 * Creates one dynamic QRIS for a fixed amount.
 *
 * The provider throttles this endpoint at 5 requests per minute per key, so callers must
 * reuse an open order instead of creating another one on every click.
 */
export async function createDeposit(amount: number): Promise<AustinDeposit> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AustinPayError("Nominal deposit tidak valid.", 400, "invalid_amount");
  }
  const payload = await call<{ success?: boolean; deposit?: Record<string, unknown> }>({
    method: "POST",
    path: "/api/deposit/create",
    body: { amount },
  });
  const deposit = payload?.deposit;
  if (!deposit) throw new AustinPayError("AustinPay tidak mengembalikan data QRIS.", 502, "empty_deposit");

  const transactionId = String(deposit.transaction_id || "").trim();
  const qrImage = String(deposit.qr_image || "").trim();
  if (!transactionId) throw new AustinPayError("AustinPay tidak mengembalikan transaction id.", 502, "empty_transaction");
  if (!qrImage.startsWith("data:image/")) {
    throw new AustinPayError("AustinPay tidak mengembalikan gambar QRIS yang valid.", 502, "empty_qr");
  }

  return {
    id: String(deposit.id || transactionId),
    transactionId,
    amount: numberish(deposit.amount, amount),
    baseAmount: numberish(deposit.base_amount, amount),
    requestedAmount: numberish(deposit.requested_amount, amount),
    uniqueCode: numberish(deposit.unique_code, 0),
    fee: numberish(deposit.fee, 0),
    feePayer: String(deposit.fee_payer || "buyer"),
    qrString: String(deposit.qr_string || ""),
    qrImage,
    expiredAt: String(deposit.expired_at || ""),
    status: String(deposit.status || "pending"),
  };
}

export type DepositStatus = "pending" | "paid" | "expired" | "failed" | "cancelled" | "unknown";

export async function checkDeposit(transactionId: string): Promise<{ status: DepositStatus; message: string }> {
  const path = `/api/deposit/check/${encodeURIComponent(transactionId)}`;
  const payload = await call<{ success?: boolean; status?: string; message?: string }>({ method: "GET", path, timeoutMs: 12_000 });
  const status = String(payload?.status || "").toLowerCase();
  const known: DepositStatus[] = ["pending", "paid", "expired", "failed", "cancelled"];
  return {
    status: (known.includes(status as DepositStatus) ? status : "unknown") as DepositStatus,
    message: String(payload?.message || ""),
  };
}

export async function cancelDeposit(transactionId: string): Promise<{ ok: boolean; status: string; message: string }> {
  const path = `/api/deposit/cancel/${encodeURIComponent(transactionId)}`;
  const payload = await call<{ success?: boolean; status?: string; message?: string }>({ method: "POST", path, timeoutMs: 12_000 });
  return {
    ok: payload?.success === true,
    status: String(payload?.status || ""),
    message: String(payload?.message || ""),
  };
}

/** Read-only probe used by the owner panel to prove the credentials work. */
export async function accountInfo(): Promise<{ username: string; email: string; status: string; balance: number }> {
  const payload = await call<{ user?: { username?: string; email?: string; status?: string; wallet?: { balance?: number } } }>({
    method: "GET",
    path: "/api/account",
    timeoutMs: 12_000,
  });
  const user = payload?.user;
  return {
    username: String(user?.username || ""),
    email: String(user?.email || ""),
    status: String(user?.status || ""),
    balance: numberish(user?.wallet?.balance, 0),
  };
}

/**
 * Webhook signature check. The raw bytes are what was signed, so the caller must read the
 * body as text before parsing it, and the comparison is timing safe.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;
  // Providers differ on the prefix (bare hex, `sha256=`, `t=..,v1=..` is not accepted).
  const received = signatureHeader.trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(received)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  // Both sides are fixed-length hex, so a constant-time compare leaks nothing useful.
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return diff === 0;
}
