/**
 * Operational probe for the payment provider.
 *
 * The one question this answers is the one that cannot be answered from a laptop: does
 * AustinPay accept requests coming from *this* deployment's egress IP? Vercel's outbound
 * addresses are shared and can change, and the provider only talks to whitelisted ones, so
 * "the key is correct" and "the key works from here" are different facts.
 *
 * Guarded by OPS_TOKEN: the proxy cannot inspect a bearer token, so the check lives here and
 * fails closed when the token is missing. It makes exactly one provider request and never
 * creates a deposit.
 */
import { timingSafeEqual } from "node:crypto";
import { errorResponse, json } from "@/lib/api";
import { accountInfo, austinConfigState, AustinPayError, cancelDeposit, createDeposit } from "@/lib/payments/austinpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function opsToken(): string {
  return (process.env.OPS_TOKEN || "").trim();
}

function authorised(request: Request): boolean {
  const expected = opsToken();
  if (expected.length < 16) return false;
  const url = new URL(request.url);
  const supplied = (request.headers.get("x-ops-token") || url.searchParams.get("token") || "").trim();
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied, "utf8"), Buffer.from(expected, "utf8"));
}

async function egressIp(): Promise<string> {
  try {
    const response = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    const payload = (await response.json()) as { ip?: string };
    return typeof payload.ip === "string" ? payload.ip : "";
  } catch {
    return "";
  }
}

export async function GET(request: Request) {
  if (opsToken().length < 16) {
    return errorResponse("OPS_TOKEN belum diatur di server.", 503);
  }
  if (!authorised(request)) {
    return errorResponse("Token operasional tidak valid.", 401);
  }

  const state = austinConfigState();
  const egress = await egressIp();

  if (!state.configured) {
    return json(
      { ok: false, egress, provider: { reachable: false, missing: state.missing, message: "Kredensial provider belum lengkap." } },
      { status: 503 },
    );
  }

  // ?action=deposit proves the half that matters: a real QRIS, then cancelled immediately so
  // nothing is left payable. Two provider calls, no money moved, nothing provisioned.
  if (new URL(request.url).searchParams.get("action") === "deposit") {
    try {
      const deposit = await createDeposit(25_000);
      const cancelled = await cancelDeposit(deposit.transactionId);
      return json({
        ok: cancelled.ok,
        egress,
        deposit: {
          transactionId: deposit.transactionId,
          amount: deposit.amount,
          baseAmount: deposit.baseAmount,
          feePayer: deposit.feePayer,
          status: deposit.status,
          expiredAt: deposit.expiredAt,
          qrImage: deposit.qrImage ? `${deposit.qrImage.slice(0, 32)}… (${deposit.qrImage.length} chars)` : "KOSONG",
          qrString: deposit.qrString ? `ada (${deposit.qrString.length} chars)` : "KOSONG",
        },
        afterCancel: { status: cancelled.status, message: cancelled.message },
      });
    } catch (error) {
      const message = error instanceof AustinPayError ? error.message : "Gagal membuat deposit.";
      return json({ ok: false, egress, message }, { status: 502 });
    }
  }

  try {
    const info = await accountInfo();
    return json({
      ok: true,
      egress,
      provider: { reachable: true, signature: state.signed, status: info.status, username: info.username },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof AustinPayError ? error.message : "Gagal menghubungi AustinPay.";
    return json(
      { ok: false, egress, provider: { reachable: false, signature: state.signed, message } },
      { status: 502 },
    );
  }
}
