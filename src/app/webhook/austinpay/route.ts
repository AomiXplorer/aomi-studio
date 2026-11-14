/**
 * AustinPay webhook: the primary confirmation path.
 *
 * The signature is checked against the raw bytes exactly as they arrived, before anything
 * is parsed, with a timing-safe comparison. Nothing the browser could send can reach this
 * handler's business logic, and the provider's `deposit.paid` is the only event that can
 * create an account.
 *
 * The response is always a fast 2xx for events we understand (the provider retries up to
 * three times otherwise), and every outcome is written to the audit trail.
 */
import { after } from "next/server";
import { errorResponse, json, serverError } from "@/lib/api";
import { audit } from "@/lib/db/audit";
import { clearOpenOrder, getOrderByTransaction, markPaid, updateOrder } from "@/lib/db/orders";
import { verifyWebhookSignature, webhookSecret } from "@/lib/payments/austinpay";
import { deliverCredentials, provisionAccount } from "@/lib/payments/provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface WebhookBody {
  event?: string;
  data?: {
    transactionId?: string;
    amount?: number;
    status?: string;
    paidAt?: string;
  };
  sentAt?: string;
}

export async function POST(request: Request) {
  const secret = webhookSecret();
  if (!secret) {
    // Fail closed and say why in the response body: an unsigned webhook must never settle.
    return errorResponse("Webhook secret belum dikonfigurasi di server.", 503);
  }

  // Raw body first: parsing and re-serialising would change the bytes that were signed.
  const raw = await request.text();
  const signature = request.headers.get("x-austinpay-signature");
  if (!verifyWebhookSignature(raw, signature, secret)) {
    await audit({
      actorType: "system",
      actorId: "austinpay",
      action: "purchase.webhook_rejected",
      target: "signature",
      detail: "signature tidak valid",
    }).catch(() => undefined);
    return errorResponse("Signature tidak valid.", 401);
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return errorResponse("Payload bukan JSON.", 400);
  }

  const event = String(body.event || request.headers.get("x-austinpay-event") || "");
  if (event !== "deposit.paid") {
    // withdraw.* and mutasi.* are not ours to act on.
    return json({ ok: true, ignored: event || "unknown" });
  }

  const transactionId = String(body.data?.transactionId || "").trim();
  if (!transactionId) return json({ ok: true, ignored: "missing_transaction" });

  try {
    const order = await getOrderByTransaction(transactionId);
    if (!order) {
      await audit({
        actorType: "system",
        actorId: "austinpay",
        action: "purchase.webhook_unknown_order",
        target: transactionId,
        detail: "tidak ada order lokal untuk transaksi ini",
      });
      // 200 on purpose: the provider cannot fix this, and retrying would not help.
      return json({ ok: true, ignored: "unknown_order" });
    }

    if (typeof body.data?.amount === "number" && order.payableAmount && body.data.amount !== order.payableAmount) {
      await audit({
        actorType: "system",
        actorId: "austinpay",
        action: "purchase.webhook_amount_mismatch",
        target: order.id,
        detail: `dibayar ${body.data.amount}, tagihan ${order.payableAmount}`,
      });
    }

    const paidAt = typeof body.data?.paidAt === "string" && Number.isFinite(Date.parse(body.data.paidAt))
      ? new Date(body.data.paidAt).toISOString()
      : new Date().toISOString();

    const settled = await markPaid(order.id, {
      paidAt,
      settledBy: "webhook",
      payableAmount: typeof body.data?.amount === "number" ? body.data.amount : undefined,
    });

    if (settled === "missing") return json({ ok: true, ignored: "gone" });

    await updateOrder(order.id, { webhookAt: new Date().toISOString() });
    await clearOpenOrder(order.email);

    if (settled === "paid") {
      await audit({
        actorType: "system",
        actorId: "austinpay",
        action: "purchase.paid_webhook",
        target: order.id,
        detail: `${order.email} · ${transactionId}`,
      });
    }

    // Account creation finishes inside this request so the account exists even if nobody
    // polls; only the email is allowed to run past the response.
    const outcome = await provisionAccount(order.id, { deferEmail: true });
    if (settled === "paid" || outcome.state === "created") {
      after(async () => {
        await deliverCredentials(order.id).catch(() => undefined);
      });
    }

    return json({ ok: true, settled, provision: outcome.state });
  } catch (error) {
    return serverError(error);
  }
}

/** Some providers probe the URL with GET while the owner is setting it up. */
export async function GET() {
  return json({ ok: true, service: "aomi-austinpay-webhook", method: "POST" });
}
