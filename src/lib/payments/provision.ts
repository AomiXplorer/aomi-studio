/**
 * Turns a verified payment into an account, exactly once.
 *
 * The order is the source of truth: `status = paid` is written before this runs and is
 * never reverted, so a failure here leaves money accounted for and only the account step
 * unfinished. A Redis lock makes concurrent webhook/poll deliveries harmless, and every
 * step is idempotent so a retry from the owner panel finishes the same order instead of
 * creating a second account.
 *
 * The generated password exists in plaintext only inside this function and inside the
 * message it is sent in. At rest it is AES-256-GCM ciphertext on the order row, which is
 * what makes "retry the email" possible without ever showing a password to a browser.
 */
import { randomInt } from "node:crypto";
import { PANEL_URL } from "@/lib/db/keys";
import { audit } from "@/lib/db/audit";
import { createMail, updateMail } from "@/lib/db/mails";
import {
  claimProvisioning,
  createOrder,
  getOrder,
  packCredential,
  releaseProvisioning,
  updateOrder,
  unpackCredential,
  type OrderRecord,
} from "@/lib/db/orders";
import { createUserWithHash, getUserByEmail, getUserByUsername, setPassword } from "@/lib/db/users";
import { bcryptHash } from "@/lib/auth/bcrypt";
import { loadAuthConfig, findUser } from "@/lib/auth/config";
import { openSecret, sealSecret } from "@/lib/crypto/secrets";
import { sendMail } from "@/lib/mail/mailer";
import { WELCOME_SUBJECT, welcomeHtml, welcomeText } from "@/lib/mail/templates";
import { formatIdr } from "./catalog";

/** Names that must never be handed to a buyer, on top of the owner's own username. */
const RESERVED = new Set(["admin", "administrator", "owner", "root", "aomi", "system", "support", "staff", "official", "help"]);

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * `Aomi-XXXX-XXXX-XXXX`, 12 random characters from a 57-symbol alphabet (about 70 bits).
 * Letters and digits are guaranteed so the account always passes the app's own password
 * policy, and neither the username nor the email is ever part of it.
 */
export function generatePassword(): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const groups: string[] = [];
    for (let group = 0; group < 3; group += 1) {
      let chunk = "";
      for (let index = 0; index < 4; index += 1) chunk += ALPHABET[randomInt(ALPHABET.length)];
      groups.push(chunk);
    }
    const candidate = `Aomi-${groups.join("-")}`;
    if (/[A-Za-z]/.test(candidate) && /[0-9]/.test(candidate)) return candidate;
  }
  // Unreachable in practice; kept so the function always returns a policy-compliant value.
  return `Aomi-${randomInt(1000, 9999)}-${randomInt(1000, 9999)}-Abcd`;
}

export function reservedUsername(username: string): boolean {
  return RESERVED.has((username || "").trim().toLowerCase());
}

export interface UsernameCheck {
  ok: boolean;
  reason?: string;
}

/** Shared by the purchase form and the final write, so both answer the same question. */
export async function usernameAvailable(username: string): Promise<UsernameCheck> {
  const trimmed = (username || "").trim();
  if (!trimmed) return { ok: false, reason: "Username wajib diisi." };
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(trimmed)) {
    return { ok: false, reason: "Username 3-32 karakter: huruf, angka, titik, garis bawah atau strip." };
  }
  if (reservedUsername(trimmed)) return { ok: false, reason: "Username ini tidak bisa dipakai." };
  // The owner's own sign-in name is never for sale, even before the mirror row exists.
  try {
    const state = await loadAuthConfig();
    if (findUser(state.config, trimmed)) return { ok: false, reason: "Username ini tidak bisa dipakai." };
  } catch {
    // A config outage must not block a checkout; the atomic write below still protects us.
  }
  const existing = await getUserByUsername(trimmed);
  if (existing) return { ok: false, reason: "Username ini sudah dipakai. Coba yang lain." };
  return { ok: true };
}

/** Adds a numeric tail until the name is free, for the rare race after payment. */
async function freeUsername(base: string): Promise<string> {
  const clean = base.trim().slice(0, 32);
  for (let suffix = 0; suffix < 12; suffix += 1) {
    const candidate = suffix === 0 ? clean : `${clean.slice(0, 32 - String(suffix + 1).length)}${suffix + 1}`;
    if (reservedUsername(candidate)) continue;
    const taken = await getUserByUsername(candidate);
    if (!taken) return candidate;
  }
  return `${clean.slice(0, 24)}${randomInt(1000, 9999)}`;
}

export type ProvisionOutcome =
  | { state: "created" | "already"; order: OrderRecord; username: string; emailSent: boolean; emailError: string }
  | { state: "busy"; order: OrderRecord }
  | { state: "not_paid" | "missing"; order: OrderRecord | null }
  | { state: "failed"; order: OrderRecord; error: string };

/**
 * Creates the account for a paid order.
 *
 * Callers must have verified the payment first; this function refuses to act on an order
 * that is not `paid`, which is the last line of defence behind the webhook signature.
 */
export async function provisionAccount(
  orderId: string,
  options: { deferEmail?: boolean } = {},
): Promise<ProvisionOutcome> {
  const first = await getOrder(orderId);
  if (!first) return { state: "missing", order: null };
  if (first.status !== "paid") return { state: "not_paid", order: first };
  if (first.provisionStatus === "done" && first.userId) {
    return { state: "already", order: first, username: first.username, emailSent: first.emailStatus === "sent", emailError: first.emailError };
  }

  const claimed = await claimProvisioning(orderId);
  if (!claimed) {
    const current = await getOrder(orderId);
    return { state: "busy", order: current || first };
  }

  try {
    const order = await getOrder(orderId);
    if (!order) return { state: "missing", order: null };
    if (order.provisionStatus === "done" && order.userId) {
      return { state: "already", order, username: order.username, emailSent: order.emailStatus === "sent", emailError: order.emailError };
    }

    await updateOrder(orderId, { provisionStatus: "pending", provisionError: "" });

    // A previous attempt may have created the account and then failed to send the email.
    const existing = await getUserByEmail(order.email);
    if (existing && existing.role === "user") {
      await updateOrder(orderId, { userId: existing.id, username: existing.username, provisionStatus: "done", provisionError: "" });
      const email = options.deferEmail
        ? { ok: false, error: "email dijadwalkan" }
        : await deliverCredentials(orderId);
      return {
        state: "already",
        order: (await getOrder(orderId)) || order,
        username: existing.username,
        emailSent: email.ok,
        emailError: email.error,
      };
    }

    const username = await freeUsername(order.username);
    const password = generatePassword();
    const hash = await bcryptHash(password);

    const created = await createUserWithHash({
      username,
      hash,
      role: "user",
      createdBy: `purchase:${order.id}`,
      email: order.email,
    });

    if ("error" in created) {
      await updateOrder(orderId, { provisionStatus: "failed", provisionError: created.error });
      await audit({ actorType: "system", actorId: "provision", action: "purchase.provision_failed", target: order.id, detail: created.error });
      return { state: "failed", order: (await getOrder(orderId)) || order, error: created.error };
    }

    const sealed = sealSecret(password);
    await updateOrder(orderId, {
      userId: created.user.id,
      username: created.user.username,
      provisionStatus: "done",
      provisionError: "",
      credentialCipher: packCredential(sealed),
      emailStatus: "pending",
    });
    await audit({
      actorType: "system",
      actorId: "provision",
      action: "purchase.account_created",
      target: created.user.username,
      detail: `order ${order.id}`,
    });

    // The account is always written before the webhook answers, so the account exists even
    // if the buyer closes the tab. Only the email may be pushed past the response.
    const delivery = options.deferEmail
      ? { ok: false, error: "email dijadwalkan", mailId: "" }
      : await deliverCredentials(orderId, password);
    return {
      state: "created",
      order: (await getOrder(orderId)) || order,
      username: created.user.username,
      emailSent: delivery.ok,
      emailError: delivery.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "provisioning gagal";
    await updateOrder(orderId, { provisionStatus: "failed", provisionError: message.slice(0, 300) }).catch(() => undefined);
    await audit({ actorType: "system", actorId: "provision", action: "purchase.provision_failed", target: orderId, detail: message }).catch(() => undefined);
    return { state: "failed", order: (await getOrder(orderId)) || first, error: message };
  } finally {
    await releaseProvisioning(orderId).catch(() => undefined);
  }
}

/**
 * Sends (or re-sends) the credential email for an order that already has an account.
 *
 * `password` is only ever supplied by the caller that just generated it; otherwise the
 * ciphertext on the order is opened. Nothing here returns the password to an HTTP client.
 */
export async function deliverCredentials(orderId: string, password?: string): Promise<{ ok: boolean; error: string; mailId: string }> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: "Order tidak ditemukan.", mailId: "" };
  if (!order.userId) return { ok: false, error: "Akun belum dibuat untuk order ini.", mailId: "" };

  let secret = password || "";
  if (!secret) {
    const sealed = unpackCredential(order.credentialCipher);
    if (!sealed) {
      await updateOrder(orderId, { emailStatus: "failed", emailError: "Password tidak tersimpan; reset password dulu." });
      return { ok: false, error: "Password tidak tersimpan; pakai reset password untuk mengirim kredensial baru.", mailId: "" };
    }
    try {
      secret = openSecret(sealed);
    } catch {
      await updateOrder(orderId, { emailStatus: "failed", emailError: "Gagal membuka kredensial tersimpan." });
      return { ok: false, error: "Gagal membuka kredensial tersimpan. Reset password untuk mengirim yang baru.", mailId: "" };
    }
  }

  const loginUrl = `${PANEL_URL}/login`;
  const paidAt = order.paidAt ? new Date(order.paidAt) : new Date();
  const body = {
    username: order.username,
    password: secret,
    email: order.email,
    loginUrl,
    amountIdr: order.payableAmount || order.requestedAmount,
    orderId: order.id,
    paidAt: paidAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }) + " WIB",
  };

  const mail = await createMail({ orderId, userId: order.userId, to: order.email, subject: WELCOME_SUBJECT });
  await updateOrder(orderId, { emailStatus: "pending", emailError: "" });
  const result = await sendMail({ to: order.email, subject: WELCOME_SUBJECT, text: welcomeText(body), html: welcomeHtml(body) });

  if (result.ok) {
    const at = new Date().toISOString();
    await updateMail(mail.id, { status: "sent", providerId: result.providerId, attempts: 1, sentAt: at, error: "" });
    await updateOrder(orderId, { emailStatus: "sent", emailError: "", emailSentAt: at });
    return { ok: true, error: "", mailId: mail.id };
  }

  await updateMail(mail.id, { status: "failed", attempts: 1, error: result.error });
  await updateOrder(orderId, { emailStatus: "failed", emailError: result.error.slice(0, 300) });
  return { ok: false, error: result.error, mailId: mail.id };
}

/**
 * Owner-side recovery: issue a brand new password, store its hash, and email it.
 * Used when the ciphertext cannot be opened (a rotated encryption key) or the buyer lost
 * the original message.
 */
export async function resetAndSendCredentials(orderId: string): Promise<{ ok: boolean; error: string; username: string }> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: "Order tidak ditemukan.", username: "" };
  if (!order.userId) return { ok: false, error: "Order ini belum punya akun.", username: "" };

  const password = generatePassword();
  await setPassword(order.userId, password);
  await updateOrder(orderId, { credentialCipher: packCredential(sealSecret(password)) });
  const result = await deliverCredentials(orderId, password);
  return { ok: result.ok, error: result.error, username: order.username };
}

/** Re-exported so the order route can create a row without importing two modules. */
export { createOrder };
export const priceLabel = (value: number) => formatIdr(value);
