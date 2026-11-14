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

export function smtpConfigState(): SmtpConfigState {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASSWORD");
  const from = env("SMTP_FROM") || user;
  const port = smtpPort();
  const missing: string[] = [];
  if (!host) missing.push("SMTP_HOST");
  if (!env("SMTP_PORT")) missing.push("SMTP_PORT");
  if (!user) missing.push("SMTP_USER");
  if (!pass) missing.push("SMTP_PASSWORD");
  if (!env("SMTP_FROM")) missing.push("SMTP_FROM");
  return { configured: missing.length === 0, host, port, secure: port === 465, from, user, missing };
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
