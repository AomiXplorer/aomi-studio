/**
 * Buyer-initiated cancellation.
 *
 * Only a pending order can be cancelled. The provider is told as well, so its dashboard and
 * ours agree, but the QR itself may still be scannable until it expires: if money arrives
 * afterwards the verified payment still wins and the account is created.
 */
import { errorResponse, json, serverError } from "@/lib/api";
import { sameOrigin } from "@/lib/auth/require";
import { audit } from "@/lib/db/audit";
import { clearOpenOrder, getOrder, publicOrder, tokensMatch, updateOrder } from "@/lib/db/orders";
import { cancelDeposit, AustinPayError } from "@/lib/payments/austinpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return errorResponse("Origin tidak diizinkan.", 403);
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("t") || "";

  try {
    const order = await getOrder(id);
    if (!order || !tokensMatch(order, token)) return errorResponse("Order tidak ditemukan.", 404);

    if (order.status === "paid") {
      return errorResponse("Pembayaran ini sudah lunas dan akun sudah diproses.", 409);
    }
    if (order.status !== "pending") {
      return json({ ok: true, order: publicOrder(order), alreadyClosed: true });
    }

    let providerNote = "";
    if (order.austinTransactionId) {
      try {
        const result = await cancelDeposit(order.austinTransactionId);
        providerNote = result.message;
      } catch (error) {
        if (!(error instanceof AustinPayError)) throw error;
        providerNote = error.message;
      }
    }

    await updateOrder(order.id, { status: "cancelled", cancelledAt: new Date().toISOString() });
    await clearOpenOrder(order.email);
    await audit({
      actorType: "user",
      actorId: order.email,
      action: "purchase.cancelled",
      target: order.id,
      detail: providerNote.slice(0, 200),
    });

    const current = await getOrder(order.id);
    return json({ ok: true, order: publicOrder(current || order), providerNote });
  } catch (error) {
    return serverError(error);
  }
}
