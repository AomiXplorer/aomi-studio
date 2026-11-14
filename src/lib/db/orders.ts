/**
 * Purchase orders: the local record of one attempt to buy Aomi access.
 *
 * One order owns exactly one provider transaction, and the buyer never holds an id that
 * proves ownership: a random `token` is issued with the order, only its SHA-256 hash is
 * stored, and every read from the browser has to present the token. Order ids therefore
 * cannot be enumerated and a leaked link cannot be replayed after a new one is issued.
 *
 * Status transitions only ever move forward:
 *   pending -> paid -> (provisioning) -> done
 *   pending -> expired | cancelled
 * A verified payment is the only thing that can leave `pending`, and it is written
 * atomically so two webhook deliveries cannot both start provisioning.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hashToObject, hgetall, redis, redisEval, redisPipeline } from "./redis";
import { K } from "./keys";
import type { SealedSecret } from "@/lib/crypto/secrets";

export type OrderStatus = "pending" | "paid" | "expired" | "failed" | "cancelled";
export type ProvisionStatus = "none" | "pending" | "done" | "failed";
export type EmailStatus = "none" | "pending" | "sent" | "failed";

export interface OrderRecord {
  id: string;
  productId: string;
  email: string;
  username: string;
  /** Price from the server catalogue at the time of purchase. */
  requestedAmount: number;
  /** Exactly what the provider asked the buyer to pay (fee and unique code included). */
  payableAmount: number;
  fee: number;
  uniqueCode: number;
  status: OrderStatus;
  provisionStatus: ProvisionStatus;
  provisionError: string;
  /** Why the provider call failed, when it did. Never shown to a buyer verbatim. */
  providerError: string;
  userId: string;
  emailStatus: EmailStatus;
  emailError: string;
  austinTransactionId: string;
  austinDepositId: string;
  qrImage: string;
  qrString: string;
  expiresAt: string;
  paidAt: string;
  cancelledAt: string;
  createdAt: string;
  updatedAt: string;
  emailSentAt: string;
  webhookAt: string;
  ipHash: string;
  /** Settled through a webhook rather than a status poll, for the audit trail. */
  settledBy: string;
  /** AES-256-GCM ciphertext of the generated password, kept only so an email can be retried. */
  credentialCipher: string;
  tokenHash: string;
}

const EMPTY: OrderRecord = {
  id: "",
  productId: "",
  email: "",
  username: "",
  requestedAmount: 0,
  payableAmount: 0,
  fee: 0,
  uniqueCode: 0,
  status: "pending",
  provisionStatus: "none",
  provisionError: "",
  providerError: "",
  userId: "",
  emailStatus: "none",
  emailError: "",
  austinTransactionId: "",
  austinDepositId: "",
  qrImage: "",
  qrString: "",
  expiresAt: "",
  paidAt: "",
  cancelledAt: "",
  createdAt: "",
  updatedAt: "",
  emailSentAt: "",
  webhookAt: "",
  ipHash: "",
  settledBy: "",
  credentialCipher: "",
  tokenHash: "",
};

function toRecord(raw: Record<string, string> | null): OrderRecord | null {
  if (!raw || !raw.id) return null;
  const status = raw.status as OrderStatus;
  return {
    ...EMPTY,
    ...raw,
    requestedAmount: Number(raw.requestedAmount || 0),
    payableAmount: Number(raw.payableAmount || 0),
    fee: Number(raw.fee || 0),
    uniqueCode: Number(raw.uniqueCode || 0),
    status: (["pending", "paid", "expired", "failed", "cancelled"] as OrderStatus[]).includes(status) ? status : "pending",
    provisionStatus: ((raw.provisionStatus || "none") as ProvisionStatus) || "none",
    emailStatus: ((raw.emailStatus || "none") as EmailStatus) || "none",
  } as OrderRecord;
}

/** Redis hashes hold strings only; undefined values are dropped instead of stringified. */
function pairs(patch: Record<string, unknown>): (string | number)[] {
  const flat: (string | number)[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    flat.push(key, typeof value === "number" ? String(value) : String(value));
  }
  return flat;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensMatch(order: OrderRecord, token: string | null | undefined): boolean {
  if (!order.tokenHash || !token) return false;
  const left = Buffer.from(hashToken(token), "hex");
  const right = Buffer.from(order.tokenHash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function newOrderId(): string {
  // Readable in a support conversation, unguessable as a key.
  return `AOMI-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export function newOrderToken(): string {
  return randomBytes(24).toString("base64url");
}

export interface CreateOrderInput {
  productId: string;
  email: string;
  username: string;
  requestedAmount: number;
  ipHash: string;
  /** Seconds the buyer has to pay; mirrors the provider's QR lifetime. */
  ttlSeconds: number;
}

export async function createOrder(input: CreateOrderInput): Promise<{ order: OrderRecord; token: string }> {
  const id = newOrderId();
  const token = newOrderToken();
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + Math.max(60, input.ttlSeconds) * 1000).toISOString();
  const record: OrderRecord = {
    ...EMPTY,
    id,
    productId: input.productId,
    email: input.email.trim(),
    username: input.username.trim(),
    requestedAmount: input.requestedAmount,
    payableAmount: input.requestedAmount,
    status: "pending",
    provisionStatus: "none",
    emailStatus: "none",
    expiresAt,
    createdAt,
    updatedAt: createdAt,
    ipHash: input.ipHash,
    tokenHash: hashToken(token),
  };

  await redisPipeline([
    ["HSET", K.order(id), ...pairs(record as unknown as Record<string, unknown>)],
    ["ZADD", K.orders, now, id],
    ["EXPIRE", K.order(id), 60 * 60 * 24 * 90],
  ]);
  await redis("SET", K.orderOpen(record.email.toLowerCase()), id, "EX", Math.max(60, input.ttlSeconds));
  return { order: record, token };
}

/** Issues a fresh token for an order that already exists, invalidating the previous link. */
export async function rotateToken(id: string): Promise<string> {
  const token = newOrderToken();
  await redis("HSET", K.order(id), "tokenHash", hashToken(token));
  return token;
}

export async function getOrder(id: string): Promise<OrderRecord | null> {
  if (!id) return null;
  return toRecord(await hgetall(K.order(id)));
}

export async function getOrderByTransaction(transactionId: string): Promise<OrderRecord | null> {
  if (!transactionId) return null;
  const id = await redis<string | null>("GET", K.orderByTransaction(transactionId));
  return id ? getOrder(id) : null;
}

/** The single open order for an address, so a reload cannot mint a second QRIS. */
export async function getOpenOrderId(email: string): Promise<string | null> {
  const id = await redis<string | null>("GET", K.orderOpen(email.trim().toLowerCase()));
  return id || null;
}

export async function clearOpenOrder(email: string): Promise<void> {
  await redis("DEL", K.orderOpen(email.trim().toLowerCase()));
}

export async function updateOrder(id: string, patch: Partial<OrderRecord> & Record<string, unknown>): Promise<void> {
  const flat = pairs({ ...patch, updatedAt: new Date().toISOString() });
  if (flat.length === 0) return;
  await redis("HSET", K.order(id), ...flat);
}

export async function listOrders(limit = 200): Promise<OrderRecord[]> {
  const ids = await redis<string[]>("ZREVRANGE", K.orders, 0, Math.max(0, limit - 1));
  if (!ids || ids.length === 0) return [];
  const rows = await redisPipeline(ids.map((id) => ["HGETALL", K.order(id)]));
  return rows
    .map((row) => toRecord(hashToObject(row)))
    .filter((row): row is OrderRecord => Boolean(row));
}

export interface OrderStats {
  users: number;
  paid: number;
  pending: number;
  failed: number;
  revenue: number;
  emailsSent: number;
  emailsFailed: number;
}

/**
 * Counters the owner panel shows. They are derived from the order rows rather than kept in
 * a separate counter, so a retry or a refund can never drift away from the truth.
 */
export function summarise(orders: OrderRecord[]): OrderStats {
  const stats: OrderStats = { users: 0, paid: 0, pending: 0, failed: 0, revenue: 0, emailsSent: 0, emailsFailed: 0 };
  for (const order of orders) {
    if (order.status === "paid") {
      stats.paid += 1;
      stats.revenue += order.payableAmount || order.requestedAmount;
    } else if (order.status === "pending") {
      stats.pending += 1;
    } else if (order.status === "failed" || order.status === "expired" || order.status === "cancelled") {
      stats.failed += 1;
    }
    if (order.emailStatus === "sent") stats.emailsSent += 1;
    if (order.emailStatus === "failed") stats.emailsFailed += 1;
  }
  return stats;
}

/** Marks an unpaid order expired once the provider's QR lifetime has passed. */
export function isExpired(order: OrderRecord): boolean {
  if (order.status !== "pending") return false;
  const until = Date.parse(order.expiresAt || "");
  return Number.isFinite(until) ? until <= Date.now() : false;
}

/**
 * Flips an order to paid, exactly once.
 *
 * The Lua script reads and writes in one round trip, so a webhook and a status poll that
 * arrive together cannot both win. Returns `already` when the order was paid before, which
 * is what makes duplicate deliveries free.
 */
export async function markPaid(id: string, input: { paidAt: string; settledBy: string; payableAmount?: number }): Promise<"paid" | "already" | "missing"> {
  const result = await redisEval<string>(
    [
      "if redis.call('EXISTS', KEYS[1]) == 0 then return 'missing' end",
      "local status = redis.call('HGET', KEYS[1], 'status')",
      "if status == 'paid' then",
      "  redis.call('HSET', KEYS[1], 'updatedAt', ARGV[4])",
      "  return 'already'",
      "end",
      "redis.call('HSET', KEYS[1], 'status', 'paid', 'paidAt', ARGV[1], 'settledBy', ARGV[2], 'updatedAt', ARGV[4])",
      "if ARGV[3] ~= '' then redis.call('HSET', KEYS[1], 'payableAmount', ARGV[3]) end",
      "return 'paid'",
    ].join("\n"),
    [K.order(id)],
    [input.paidAt, input.settledBy, input.payableAmount ? String(input.payableAmount) : "", new Date().toISOString()],
  );
  if (result === "paid" || result === "already" || result === "missing") return result;
  return "missing";
}

/** One provisioning worker at a time, even across serverless instances. */
export async function claimProvisioning(id: string, ttlSeconds = 120): Promise<boolean> {
  const claimed = await redis<string | null>("SET", K.orderLock(id), "1", "NX", "EX", ttlSeconds);
  return claimed === "OK";
}

export async function releaseProvisioning(id: string): Promise<void> {
  await redis("DEL", K.orderLock(id));
}

/** The generated password is kept only as ciphertext, so a failed email can be retried. */
export function packCredential(sealed: SealedSecret): string {
  return JSON.stringify(sealed);
}

export function unpackCredential(raw: string): SealedSecret | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SealedSecret;
    if (!parsed?.cipher || !parsed?.iv || !parsed?.tag) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Links a provider transaction id to its order exactly once. */
export async function linkTransaction(orderId: string, transactionId: string): Promise<void> {
  await redisPipeline([
    ["HSET", K.order(orderId), "austinTransactionId", transactionId],
    ["SET", K.orderByTransaction(transactionId), orderId],
  ]);
}

/**
 * The only order shape that ever reaches a browser.
 *
 * The credential cipher, the token hash and the internal lock never appear here, and the
 * password itself is not part of the record at all.
 */
export function publicOrder(order: OrderRecord) {
  return {
    id: order.id,
    product: order.productId,
    email: order.email,
    username: order.username,
    requestedAmount: order.requestedAmount,
    payableAmount: order.payableAmount,
    fee: order.fee,
    uniqueCode: order.uniqueCode,
    status: order.status,
    provisionStatus: order.provisionStatus,
    emailStatus: order.emailStatus,
    qrImage: order.qrImage,
    transactionId: order.austinTransactionId,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    settledBy: order.settledBy,
  };
}

export type PublicOrder = ReturnType<typeof publicOrder>;

/** Admin rows carry the operational detail the owner needs and nothing sensitive. */
export function adminOrder(order: OrderRecord) {
  return {
    ...publicOrder(order),
    userId: order.userId,
    provisionError: order.provisionError,
    providerError: order.providerError,
    emailError: order.emailError,
    emailSentAt: order.emailSentAt,
    webhookAt: order.webhookAt,
    updatedAt: order.updatedAt,
  };
}
