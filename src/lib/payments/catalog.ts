/**
 * What is for sale. The price is a server constant: the browser can ask for a product,
 * never name a number, and the checkout compares what it is about to charge against this
 * catalogue rather than against anything that arrived over the wire.
 */
export interface AccessProduct {
  id: string;
  name: string;
  tagline: string;
  /** Integer rupiah, before the payment provider's fee. */
  priceIdr: number;
  currency: "IDR";
  billing: "one-time";
  grants: string;
}

const DEFAULT_PRICE_IDR = 25_000;

/** `AOMI_ACCESS_PRICE` exists so the owner can reprice without a code change. */
export function accessPriceIdr(): number {
  const raw = Number(process.env.AOMI_ACCESS_PRICE || DEFAULT_PRICE_IDR);
  if (!Number.isFinite(raw)) return DEFAULT_PRICE_IDR;
  const rounded = Math.trunc(raw);
  // A guard rail, not a business rule: a typo must never sell access for Rp1.
  if (rounded < 1_000 || rounded > 10_000_000) return DEFAULT_PRICE_IDR;
  return rounded;
}

export function accessProduct(): AccessProduct {
  return {
    id: "aomi-ai-access",
    name: "Aomi AI Access",
    tagline: "Satu akun, semua fitur Aomi.",
    priceIdr: accessPriceIdr(),
    currency: "IDR",
    billing: "one-time",
    grants: "Akun pengguna Aomi",
  };
}

export function formatIdr(value: number): string {
  return `Rp${Math.max(0, Math.trunc(value)).toLocaleString("id-ID")}`;
}
