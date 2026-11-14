/**
 * The welcome email.
 *
 * Plain, dark, and built from tables because email clients are not browsers: no web
 * fonts, no flexbox, no external images that might be blocked. The credentials sit in
 * text, never behind a link, so nothing sensitive is ever sent as a URL parameter.
 */
import { formatIdr } from "@/lib/payments/catalog";

export const WELCOME_SUBJECT = "Welcome to Aomi — Your Account Is Ready!";

export interface WelcomeInput {
  username: string;
  password: string;
  email: string;
  loginUrl: string;
  amountIdr: number;
  orderId: string;
  paidAt: string;
}

export function welcomeText(input: WelcomeInput): string {
  return [
    "Hi!",
    "",
    "Your payment has been successfully received.",
    "",
    "Welcome to Aomi! Your account is now ready.",
    "",
    "Here are your login credentials:",
    "",
    `Username: ${input.username}`,
    `Password: ${input.password}`,
    "",
    "Login here:",
    input.loginUrl,
    "",
    "For security reasons, please change your password after your first login.",
    "",
    "Thank you for choosing Aomi.",
    "",
    "Aomi Team",
    "Beyond Intelligence, Beyond Imagination.",
    "",
    `Order ${input.orderId} · ${formatIdr(input.amountIdr)} · ${input.paidAt}`,
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function welcomeHtml(input: WelcomeInput): string {
  const mono = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
  const sans = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const cell = "padding:14px 18px;background:#111113;border:1px solid #27272a;border-radius:10px;";
  const label = `margin:0 0 8px;font-family:${mono};font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#8b8b96;`;
  const value = `margin:0;font-family:${mono};font-size:16px;line-height:1.4;color:#fafafa;word-break:break-all;`;
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(WELCOME_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:#09090b;color:#fafafa;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Akun Aomi kamu sudah aktif. Kredensial login ada di dalam email ini.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td style="padding-bottom:18px;border-bottom:1px solid #1c1c20;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${mono};font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#a1a1aa;">
                  <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border:1px solid #3a3a3f;color:#fafafa;font-weight:600;letter-spacing:0;vertical-align:middle;">a</span>
                  <span style="padding-left:10px;">aomi studio</span>
                </td>
                <td align="right" style="font-family:${mono};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8b8b96;">akses aktif</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 0 0;">
            <p style="margin:0 0 10px;font-family:${mono};font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#8b8b96;">pembayaran diterima</p>
            <h1 style="margin:0;font-family:${sans};font-size:26px;line-height:1.2;letter-spacing:-.02em;font-weight:600;color:#fafafa;">Akun Aomi kamu sudah siap</h1>
            <p style="margin:12px 0 0;font-family:${sans};font-size:14.5px;line-height:1.6;color:#a1a1aa;">Hi! Pembayaran kamu sudah kami terima. Selamat datang di Aomi, akun kamu aktif sekarang.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="${cell}">
                  <p style="${label}">username</p>
                  <p style="${value}">${escapeHtml(input.username)}</p>
                </td>
              </tr>
              <tr><td style="height:10px;line-height:10px;">&nbsp;</td></tr>
              <tr>
                <td style="${cell}">
                  <p style="${label}">password</p>
                  <p style="${value}">${escapeHtml(input.password)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#fafafa;border-radius:8px;">
                  <a href="${escapeHtml(input.loginUrl)}" style="display:inline-block;padding:13px 22px;font-family:${mono};font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#09090b;text-decoration:none;">login ke aomi</a>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;font-family:${mono};font-size:11px;line-height:1.6;color:#8b8b96;word-break:break-all;">${escapeHtml(input.loginUrl)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 0 0;">
            <p style="margin:0;padding-left:12px;border-left:1px solid #3a3a3f;font-family:${sans};font-size:13px;line-height:1.6;color:#a1a1aa;">Demi keamanan, ganti password kamu setelah login pertama. Jangan teruskan email ini ke siapa pun.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 0 0;">
            <p style="margin:0;font-family:${sans};font-size:13.5px;line-height:1.6;color:#d4d4d8;">Terima kasih sudah memilih Aomi.<br>Aomi Team</p>
            <p style="margin:6px 0 0;font-family:${mono};font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#8b8b96;">beyond intelligence, beyond imagination</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 0 0;border-top:1px solid #1c1c20;font-family:${mono};font-size:10px;line-height:1.7;color:#52525b;">
            <span style="display:block;padding-top:16px;">order ${escapeHtml(input.orderId)} · ${escapeHtml(formatIdr(input.amountIdr))} · ${escapeHtml(input.paidAt)}</span>
            email ini dikirim otomatis setelah pembayaran terverifikasi.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
