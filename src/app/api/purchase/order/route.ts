/**
 * Creates the order and the QRIS that pays for it.
 *
 * The price never comes from the request: it is read from the server catalogue, and the
 * provider's answer is what the buyer is shown. At most one open QRIS exists per address,
 * so refreshing the page returns the same code instead of burning a second one (the
 * provider throttles this endpoint at five per minute).
 */
import { z } from "zod";
import { errorResponse, json, parseBody, serverError } from "@/lib/api";
import { sameOrigin } from "@/lib/auth/require";
import { audit } from "@/lib/db/audit";
import { clearOpenOrder, createOrder, getOpenOrderId, getOrder, isExpired, linkTransaction, publicOrder, rotateToken, updateOrder } from "@/lib/db/orders";
import { emailAvailable } from "@/lib/db/users";
import { accessProduct } from "@/lib/payments/catalog";
import { createDeposit, austinConfigState, AustinPayError } from "@/lib/payments/austinpay";
import { smtpConfigState } from "@/lib/mail/mailer";
import { clientIpHash, countHit, emailProblem, normaliseEmail } from "@/lib/payments/guard";
import { usernameAvailable } from "@/lib/payments/provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({
  email: z.string().max(254),
  username: z.string().max(64),
});

/** How long the local record waits before it is considered dead, whatever the provider says. */
const LOCAL_TTL_SECONDS = 10 * 60;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Origin tidak diizinkan.", 403);

  const ipHash = clientIpHash(request);
  const ipLimit = await countHit(`aomi:purchase:order:ip:${ipHash}`, 6, 600);
  if (!ipLimit.ok) {
    const response = errorResponse("Terlalu banyak percobaan pembuatan QRIS. Coba lagi beberapa menit lagi.", 429);
    response.headers.set("Retry-After", String(ipLimit.retryAfter));
    return response;
  }

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;

  const problem = emailProblem(parsed.data.email);
  if (problem) return errorResponse(problem, 400);

  const email = normaliseEmail(parsed.data.email);
  const username = parsed.data.username.trim();

  try {
    if (!(await emailAvailable(email))) {
      return errorResponse("Email ini sudah terdaftar. Langsung login saja.", 409);
    }
    const nameCheck = await usernameAvailable(username);
    if (!nameCheck.ok) return errorResponse(nameCheck.reason || "Username tidak bisa dipakai.", 409);

    const perEmail = await countHit(`aomi:purchase:order:email:${email}`, 4, 900);
    if (!perEmail.ok) {
      return errorResponse("Sudah ada beberapa percobaan untuk email ini. Tunggu beberapa menit.", 429);
    }

    // Reuse the QRIS that is still alive instead of asking the provider for another one.
    const openId = await getOpenOrderId(email);
    if (openId) {
      const open = await getOrder(openId);
      if (open && open.status === "pending" && open.qrImage && !isExpired(open)) {
        const token = await rotateToken(open.id);
        return json({ ok: true, order: publicOrder(open), token, product: accessProduct(), reused: true });
      }
      await clearOpenOrder(email);
    }

    const product = accessProduct();
    const { order, token } = await createOrder({
      productId: product.id,
      email,
      username,
      requestedAmount: product.priceIdr,
      ipHash,
      ttlSeconds: LOCAL_TTL_SECONDS,
    });

    // Money is only accepted when it can be delivered on: a paid order whose credential
    // email cannot be sent is a buyer with nothing to log in with. Both halves must exist.
    const provider = austinConfigState();
    const mail = smtpConfigState();
    if (!provider.configured || !mail.configured) {
      const missing = [...provider.missing, ...mail.missing].join(", ");
      await updateOrder(order.id, { status: "failed", providerError: `Konfigurasi belum lengkap: ${missing}` });
      await clearOpenOrder(email);
      return errorResponse(
        "Pembayaran belum aktif di server ini. Hubungi owner lewat WhatsApp.",
        503,
      );
    }

    try {
      const deposit = await createDeposit(product.priceIdr);
      const until = Date.parse(deposit.expiredAt);
      const ttl = Number.isFinite(until) ? Math.max(120, Math.round((until - Date.now()) / 1000)) : LOCAL_TTL_SECONDS;
      await updateOrder(order.id, {
        payableAmount: deposit.amount,
        fee: deposit.fee,
        uniqueCode: deposit.uniqueCode,
        austinDepositId: deposit.id,
        qrImage: deposit.qrImage,
        qrString: deposit.qrString,
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      });
      await linkTransaction(order.id, deposit.transactionId);
      await audit({
        actorType: "system",
        actorId: "checkout",
        action: "purchase.order_created",
        target: order.id,
        detail: `${email} · ${deposit.transactionId}`,
        ip: ipHash,
      });
      const saved = await getOrder(order.id);
      return json({ ok: true, order: publicOrder(saved || order), token, product });
    } catch (error) {
      const message = error instanceof AustinPayError ? error.message : "Gagal membuat QRIS.";
      await updateOrder(order.id, { status: "failed", providerError: message.slice(0, 300) });
      await clearOpenOrder(email);
      const status = error instanceof AustinPayError ? error.status : 502;
      return errorResponse(message, status === 429 ? 429 : 502);
    }
  } catch (error) {
    return serverError(error);
  }
}
