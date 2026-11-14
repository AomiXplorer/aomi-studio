/**
 * Server-only AI configuration. Every value here is read from the process
 * environment so no credential ever reaches the client bundle.
 */
const trimSlash = (value: string) => value.replace(/\/+$/, "");

/**
 * The active provider key is resolved per request (an administrator can switch it from
 * Telegram or the panel), so the process default is only the last link in the chain.
 */
let runtimeApiKey: string | null = null;

export function setRuntimeApiKey(key: string | null): void {
  runtimeApiKey = key && key.trim() ? key.trim() : null;
}

export const aiConfig = {
  baseUrl: trimSlash(process.env.BANGUNWEB_BASE_URL || "https://router.bangunweb.com/v1"),
  get apiKey(): string {
    return runtimeApiKey || process.env.BANGUNWEB_API_KEY || "";
  },
  defaultModel: process.env.BANGUNWEB_MODEL || "bw-swift",
  imageModel: process.env.BANGUNWEB_IMAGE_MODEL || "bwr-image",
  audioModel: process.env.BANGUNWEB_AUDIO_MODEL || "kokoro",
  audioVoice: process.env.BANGUNWEB_AUDIO_VOICE || "af_heart",
  maxSteps: Number.isFinite(Number(process.env.AOMI_MAX_STEPS)) ? Number(process.env.AOMI_MAX_STEPS) : 14,
  rateLimitPerMin: Number.isFinite(Number(process.env.AOMI_RATE_LIMIT_PER_MIN))
    ? Number(process.env.AOMI_RATE_LIMIT_PER_MIN)
    : 30,
};

export const providerKeyConfigured = () => aiConfig.apiKey.trim().length > 0;
