/** Formatting helpers so every screen looks the same and never leaks a secret. */
export const WIB = "Asia/Jakarta";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString("en-GB", {
    timeZone: WIB,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function card(lines: (string | false | null | undefined)[]): string {
  return lines.filter(Boolean).join("\n");
}

export function clip(text: string, max = 3800): string {
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
}

export const RULE = "─────────────────────";
