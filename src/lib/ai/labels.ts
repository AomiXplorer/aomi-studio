/**
 * One place that fixes how provider models are named in the product. The router exposes
 * its own brand in display names; Aomi shows its own name instead, so nothing in the UI
 * advertises the upstream vendor.
 */
export function brandLabel(value: string): string {
  return value
    .replace(/bangun\s*web/gi, "AomiX")
    .replace(/\s{2,}/g, " ")
    .trim();
}
