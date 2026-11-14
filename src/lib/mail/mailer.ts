/**
 * SMTP transport for the purchase email.
 *
 * The configuration is env-only and never invented: when a variable is missing the mailer
 * reports itself unconfigured instead of pretending to send, the order keeps its paid
 * state, and the owner can retry the same message from the panel once SMTP is filled in.
 */
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export interface SmtpConfigState {
  configured: boolean;
  provider: "brevo" | "smtp";
  host: string;
  port: number;
  secure: boolean;
  from: string;
  user: string;
  missing: string[];
}

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function smtpPort(): number {
  const parsed = Number(env("SMTP_PORT") || 587);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 65_536 ? Math.trunc(parsed) : 587;
}

function brevoKey(): string {
  return env("BREVO_API_KEY");
}

/** "Aomi <no-reply@x.com>" or a bare address. */
function parseFrom(value: string): { name: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const email = (match ? match[2] : value).trim();
  const name = (match ? match[1] : "").trim() || "Aomi";
  return { name, email };
}

export function smtpConfigState(): SmtpConfigState {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASSWORD");
  const from = env("SMTP_FROM") || user;
  const port = smtpPort();
  const from2 = from;
  // Brevo's HTTPS API needs one key instead of five SMTP fields, and works where the
  // outbound SMTP ports are blocked. It wins when both are present.
  if (brevoKey()) {
    const brevoMissing: string[] = [];
    if (!from2) brevoMissing.push("SMTP_FROM");
    return {
      configured: brevoMissing.length === 0,
      provider: "brevo",
      host: "api.brevo.com",
      port: 443,
      secure: true,
      from: from2,
      user: "brevo-api",
      missing: brevoMissing,
    };
  }
  const missing: string[] = [];
  if (!host) missing.push("SMTP_HOST");
  if (!env("SMTP_PORT")) missing.push("SMTP_PORT");
  if (!user) missing.push("SMTP_USER");
  if (!pass) missing.push("SMTP_PASSWORD");
  if (!env("SMTP_FROM")) missing.push("SMTP_FROM");
  return { configured: missing.length === 0, provider: "smtp", host, port, secure: port === 465, from, user, missing };
}

let cached: { key: string; transport: nodemailer.Transporter<SMTPTransport.SentMessageInfo> } | null = null;

function transportFor(state: SmtpConfigState): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
  const key = `${state.host}:${state.port}:${state.user}`;
  if (cached?.key === key) return cached.transport;
  const options: SMTPTransport.Options = {
    host: state.host,
    port: state.port,
    secure: state.secure,
    auth: { user: state.user, pass: env("SMTP_PASSWORD") },
    // A hung SMTP server must not hold a serverless invocation open.
    connectionTimeout: 12_000,
    greetingTimeout: 8_000,
    socketTimeout: 18_000,
  };
  const transport = nodemailer.createTransport(options);
  cached = { key, transport };
  return transport;
}

export interface SendResult {
  ok: boolean;
  providerId: string;
  error: string;
}

export async function sendMail(input: { to: string; subject: string; text: string; html: string }): Promise<SendResult> {
  const state = smtpConfigState();
  if (!state.configured) {
    return { ok: false, providerId: "", error: `SMTP belum dikonfigurasi (${state.missing.join(", ")}).` };
  }
  if (!input.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.to)) {
    return { ok: false, providerId: "", error: "Alamat email penerima tidak valid." };
  }
  if (state.provider === "brevo") {
    return sendViaBrevo(state.from, input);
  }
  try {
    const info = await transportFor(state).sendMail({
      from: state.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: { "X-Aomi-Mailer": "purchase" },
    });
    return { ok: true, providerId: String(info.messageId || ""), error: "" };
  } catch (error) {
    // The raw SMTP error can name the host and the username; keep it short and safe.
    const message = error instanceof Error ? error.message : "pengiriman gagal";
    return { ok: false, providerId: "", error: message.slice(0, 300) };
  }
}


/**
 * Brevo transactional API over HTTPS (443), so a host that blocks outbound SMTP still delivers.
 * A failed send returns an error string; it never throws, so a paid order keeps its state.
 */
async function sendViaBrevo(from: string, input: { to: string; subject: string; text: string; html: string }): Promise<SendResult> {
  const sender = parseFrom(from);
  if (!sender.email) return { ok: false, providerId: "", error: "SMTP_FROM tidak berisi alamat email." };
  const base = (env("BREVO_API_URL") || "https://api.brevo.com/v3/smtp/email").replace(/\/+$/, "");
  try {
    const response = await fetch(base, {
      method: "POST",
      headers: {
        "api-key": brevoKey(),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
        headers: { "X-Aomi-Mailer": "purchase" },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
    if (!response.ok) {
      const detail = String(payload.message || payload.code || "").trim();
      return { ok: false, providerId: "", error: `Brevo menolak pengiriman (${response.status})${detail ? `: ${detail}` : ""}`.slice(0, 300) };
    }
    return { ok: true, providerId: String(payload.messageId || ""), error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "pengiriman gagal";
    return { ok: false, providerId: "", error: message.slice(0, 300) };
  }
}
