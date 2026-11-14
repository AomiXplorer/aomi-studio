/**
 * Thin Telegram Bot API client.
 *
 * The token is read from the environment only, and every call is a plain HTTPS POST with
 * a timeout, so a slow Telegram never holds a function open. Errors are reported as a
 * result object instead of throwing, because a failed notification must not fail the
 * action that produced it.
 */
const API = "https://api.telegram.org";

function token(): string | null {
  const value = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  return value || null;
}

export function telegramConfigured(): boolean {
  return Boolean(token());
}

export interface TgResult<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function call<T>(method: string, payload: Record<string, unknown>): Promise<TgResult<T>> {
  const bot = token();
  if (!bot) return { ok: false, description: "TELEGRAM_BOT_TOKEN belum diatur." };
  try {
    const response = await fetch(`${API}/bot${bot}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });
    const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
    return data;
  } catch (error) {
    return { ok: false, description: error instanceof Error ? error.message : "network error" };
  }
}

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export const sendMessage = (chatId: number | string, text: string, keyboard?: InlineButton[][]) =>
  call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard && keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });

export const editMessage = (chatId: number | string, messageId: number, text: string, keyboard?: InlineButton[][]) =>
  call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard && keyboard.length > 0 ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });

export const answerCallback = (callbackId: string, text?: string, alert = false) =>
  call("answerCallbackQuery", {
    callback_query_id: callbackId,
    ...(text ? { text, show_alert: alert } : {}),
  });

export const setWebhook = (url: string, secret: string) =>
  call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });

export const getWebhookInfo = () => call<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo", {});

export const deleteWebhook = () => call("deleteWebhook", { drop_pending_updates: true });

export const getMe = () => call<{ id: number; username: string; first_name: string }>("getMe", {});
