/** Application settings plus the change history the administrator can inspect. */
import { redis, getJson, setJson } from "./redis";
import { K } from "./keys";

export interface AppSettings {
  defaultModel: string;
  allowTelegramApiKeys: boolean;
  retentionMessages: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

const DEFAULTS: AppSettings = {
  defaultModel: "bw-swift",
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
