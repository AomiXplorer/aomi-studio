/** Application settings plus the change history the administrator can inspect. */
import { redis, getJson, setJson } from "./redis";
import { K } from "./keys";

export interface AppSettings {
  defaultModel: string;
  /** The share title and description a link preview shows. Editable from the bot. */
  siteTitle: string;
  siteDescription: string;
  allowTelegramApiKeys: boolean;
  retentionMessages: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

const DEFAULTS: AppSettings = {
  defaultModel: "bw-swift",
  siteTitle: "Aomi Studio — AI agent × Astra",
  siteDescription:
    "Tulis permintaan, agent menulis file, menjalankan perintah, dan menyerahkan project yang bisa diunduh.",
  allowTelegramApiKeys: true,
  retentionMessages: 60,
  updatedAt: null,
  updatedBy: null,
};

export async function readSettings(): Promise<AppSettings> {
  const stored = await getJson<Partial<AppSettings>>(K.settings, {});
  return { ...DEFAULTS, ...stored };
}

export async function writeSettings(patch: Partial<AppSettings>, actor: string): Promise<AppSettings> {
  const current = await readSettings();
  const next: AppSettings = { ...current, ...patch, updatedAt: new Date().toISOString(), updatedBy: actor };
  await setJson(K.settings, next);
  await redis("LPUSH", "aomi:settings:history", JSON.stringify({ at: next.updatedAt, actor, patch }));
  await redis("LTRIM", "aomi:settings:history", 0, 99);
  return next;
}

export interface SiteMeta {
  title: string;
  description: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
}

export const SITE_META_DEFAULTS = {
  title: DEFAULTS.siteTitle,
  description: DEFAULTS.siteDescription,
} as const;

/**
 * What every page and link preview shows.
 *
 * A database failure must never take the site down, so the defaults are served instead of
 * throwing; the caller gets `isDefault` so a screen can say which text is in use.
 */
export async function readSiteMeta(): Promise<SiteMeta> {
  try {
    const stored = await readSettings();
    const title = (stored.siteTitle || DEFAULTS.siteTitle).trim();
    const description = (stored.siteDescription || DEFAULTS.siteDescription).trim();
    return {
      title,
      description,
      updatedAt: stored.updatedAt,
      updatedBy: stored.updatedBy,
      isDefault: title === DEFAULTS.siteTitle && description === DEFAULTS.siteDescription,
    };
  } catch {
    return { ...SITE_META_DEFAULTS, updatedAt: null, updatedBy: null, isDefault: true };
  }
}
