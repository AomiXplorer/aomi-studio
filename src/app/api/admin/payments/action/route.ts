/**
 * Recovery actions for a paid order.
 *
 * Every branch is idempotent and audited: a retry can never create a second account, a
 * second email is only ever sent because the owner asked, and a password is returned to
 * the owner only when the email itself could not be delivered (so it can be relayed by
 * hand) — never in the ordinary success path.
 */
import { z } from "zod";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";
import { requireAdmin, sameOrigin } from "@/lib/auth/require";
import { audit } from "@/lib/db/audit";
import { getOrder, publicOrder, updateOrder } from "@/lib/db/orders";
import { accountInfo, AustinPayError } from "@/lib/payments/austinpay";
import { deliverCredentials, provisionAccount, resetAndSendCredentials } from "@/lib/payments/provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retryProvision"), orderId: z.string().min(3).max(80) }),
  z.object({ action: z.literal("retryEmail"), orderId: z.string().min(3).max(80) }),
  z.object({ action: z.literal("resetCredentials"), orderId: z.string().min(3).max(80) }),
  z.object({ action: z.literal("cancelOrder"), orderId: z.string().min(3).max(80) }),
  z.object({ action: z.literal("probeProvider") }),
]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Origin tidak diizinkan.", 403);

  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;

  const actor = `${gate.account.user.id} (${gate.account.user.username})`;
  const input = parsed.data;

  try {
    if (input.action === "probeProvider") {
      // One request to the provider, on purpose: the owner asks for it, we never poll it.
      try {
        const info = await accountInfo();
        await audit({ actorType: "user", actorId: actor, action: "purchase.provider_probe", target: info.username || "austinpay", detail: `status ${info.status}` });
        return json({ ok: true, account: info });
      } catch (error) {
        const message = error instanceof AustinPayError ? error.message : "Gagal menghubungi AustinPay.";
        await audit({ actorType: "user", actorId: actor, action: "purchase.provider_probe_failed", target: "austinpay", detail: message });
        return errorResponse(message, 502);
      }
    }

    const order = await getOrder(input.orderId);
    if (!order) return errorResponse("Order tidak ditemukan.", 404);

    if (input.action === "retryProvision") {
      if (order.status !== "paid") return errorResponse("Order ini belum berstatus lunas.", 409);
      const outcome = await provisionAccount(order.id);
      await audit({ actorType: "user", actorId: actor, action: "purchase.provision_retry", target: order.id, detail: outcome.state });
      const current = await getOrder(order.id);
      return json({
        ok: outcome.state !== "failed",
        state: outcome.state,
        order: current ? publicOrder(current) : null,
        message:
          outcome.state === "created" || outcome.state === "already"
            ? "Akun siap."
            : outcome.state === "busy"
              ? "Pembuatan akun sedang berjalan, coba lagi sebentar."
              : outcome.state === "failed"
                ? outcome.error
                : "Order belum lunas.",
      });
    }

    if (input.action === "retryEmail") {
      if (!order.userId) return errorResponse("Order ini belum punya akun.", 409);
      const result = await deliverCredentials(order.id);
      await audit({ actorType: "user", actorId: actor, action: "purchase.email_retry", target: order.id, detail: result.ok ? "sent" : result.error.slice(0, 160) });
      return json({ ok: result.ok, message: result.ok ? "Email kredensial terkirim." : result.error });
    }

    if (input.action === "resetCredentials") {
      if (!order.userId) return errorResponse("Order ini belum punya akun.", 409);
      const result = await resetAndSendCredentials(order.id);
      await audit({ actorType: "user", actorId: actor, action: "purchase.credentials_reset", target: order.id, detail: result.ok ? "sent" : result.error.slice(0, 160) });
      return json({
        ok: true,
        emailed: result.ok,
        username: result.username,
        message: result.ok
          ? "Password baru dibuat dan dikirim ke email pembeli."
          : `Password baru dibuat, tapi email gagal terkirim: ${result.error}`,
      });
    }

    if (input.action === "cancelOrder") {
      if (order.status === "paid") return errorResponse("Order ini sudah lunas, tidak bisa dibatalkan.", 409);
      await updateOrder(order.id, { status: "cancelled", cancelledAt: new Date().toISOString() });
      await audit({ actorType: "user", actorId: actor, action: "purchase.cancelled_by_owner", target: order.id });
      const current = await getOrder(order.id);
      return json({ ok: true, order: current ? publicOrder(current) : null, message: "Order dibatalkan." });
    }

    return errorResponse("Aksi tidak dikenal.", 400);
  } catch (error) {
    return serverError(error);
  }
}
