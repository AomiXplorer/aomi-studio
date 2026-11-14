/**
 * Payment status for one order, plus the fallback confirmation path when a webhook is late.
 *
 * The browser can ask as often as it likes; the provider is asked at most once every five
 * seconds per order, which is the interval AustinPay's documentation requires. A pending
 * answer never creates an account: only a provider-confirmed `paid` moves the order, and
 * the account is created by the same idempotent function the webhook uses.
 */
import { errorResponse, json, serverError } from "@/lib/api";
import { audit } from "@/lib/db/audit";
import { clearOpenOrder, getOrder, isExpired, markPaid, publicOrder, tokensMatch, updateOrder } from "@/lib/db/orders";
import { redis } from "@/lib/db/redis";
import { K } from "@/lib/db/keys";
import { checkDeposit, AustinPayError } from "@/lib/payments/austinpay";
import { provisionAccount } from "@/lib/payments/provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const POLL_INTERVAL_SECONDS = 5;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("t") || "";

  try {
    const order = await getOrder(id);
    // An unknown id and a wrong token answer identically, so ids cannot be enumerated.
    if (!order || !tokensMatch(order, token)) {
      return errorResponse("Order tidak ditemukan.", 404);
    }

    let current = order;

    if (current.status === "pending") {
      if (isExpired(current)) {
        await updateOrder(current.id, { status: "expired" });
        await clearOpenOrder(current.email);
        current = (await getOrder(current.id)) || current;
      } else if (current.austinTransactionId) {
        const slot = await redis<string | null>("SET", K.orderPoll(current.id), "1", "NX", "EX", POLL_INTERVAL_SECONDS);
        if (slot === "OK") {
          try {
            const provider = await checkDeposit(current.austinTransactionId);
            if (provider.status === "paid") {
              const paidAt = new Date().toISOString();
              const settled = await markPaid(current.id, { paidAt, settledBy: "status" });
              await clearOpenOrder(current.email);
              if (settled === "paid") {
                await audit({
                  actorType: "system",
                  actorId: "checkout",
                  action: "purchase.paid_status",
                  target: current.id,
                  detail: current.austinTransactionId,
                });
                await provisionAccount(current.id);
              }
            } else if (provider.status === "expired" || provider.status === "failed" || provider.status === "cancelled") {
              await updateOrder(current.id, { status: provider.status === "failed" ? "failed" : "expired" });
              await clearOpenOrder(current.email);
            }
            current = (await getOrder(current.id)) || current;
          } catch (error) {
            // A provider hiccup must not look like a failed payment to the buyer.
            if (!(error instanceof AustinPayError)) throw error;
          }
        }
      }
    }

    const ready = current.provisionStatus === "done" && Boolean(current.userId);
    return json({
      ok: true,
      order: publicOrder(current),
      ready,
      account: ready ? { username: current.username, email: current.email, status: "active" as const } : null,
    });
  } catch (error) {
    return serverError(error);
  }
}
