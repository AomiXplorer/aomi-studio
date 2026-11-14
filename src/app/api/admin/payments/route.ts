/**
 * Payment management for the owner.
 *
 * Admin only, credential-free: the provider shows a masked fingerprint, SMTP shows its host
 * and sender, and no password, ciphertext or token hash ever leaves the server.
 */
import { json, serverError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/require";
import { adminOrder, listOrders, summarise } from "@/lib/db/orders";
import { listMails } from "@/lib/db/mails";
import { listUsers } from "@/lib/db/users";
import { accessProduct } from "@/lib/payments/catalog";
import { austinConfigState } from "@/lib/payments/austinpay";
import { smtpConfigState } from "@/lib/mail/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const limitParam = Number(new URL(request.url).searchParams.get("limit") || 200);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 500) : 200;

  try {
    const [orders, mails, users] = await Promise.all([listOrders(limit), listMails(100), listUsers()]);
    const stats = summarise(orders);
    return json({
      product: accessProduct(),
      orders: orders.map(adminOrder),
      mails,
      stats: {
        users: users.length,
        paidUsers: users.filter((user) => user.role === "user").length,
        paid: stats.paid,
        pending: stats.pending,
        failed: stats.failed,
        revenue: stats.revenue,
        emailsSent: stats.emailsSent,
        emailsFailed: stats.emailsFailed,
      },
      config: {
        austin: austinConfigState(),
        smtp: smtpConfigState(),
        webhookPath: "/webhook/austinpay",
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
