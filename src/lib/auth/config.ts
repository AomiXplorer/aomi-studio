import { z } from "zod";

/**
 * Credentials live outside the public repository. The owner keeps them in a private
 * GitHub repository and this server fetches that file with a read-only token held in
 * a Vercel environment variable, or supplies the same JSON through `AOMI_AUTH_JSON`.
 * Only a scrypt hash of each password is stored: the plaintext never exists here.
 */

const userSchema = z.object({
  username: z.string().min(3).max(64),
  role: z.enum(["owner", "member"]).default("owner"),
  displayName: z.string().max(80).optional(),
  scrypt: z.object({
    n: z.number().int().min(1024).max(1_048_576),
    r: z.number().int().min(1).max(32),
    p: z.number().int().min(1).max(16),
    salt: z.string().min(8).max(128),
    key: z.string().min(8).max(256),
  }),
  updatedAt: z.string().max(40).optional(),
});

const configSchema = z.object({
  version: z.literal(1),
  ownerContact: z.object({ whatsapp: z.string().regex(/^\d{6,16}$/) }).optional(),
  users: z.array(userSchema).min(1).max(20),
});

export type AuthUser = z.infer<typeof userSchema>;
export type AuthConfig = z.infer<typeof configSchema>;

export interface AuthConfigState {
  config: AuthConfig | null;
  source: "private-repo" | "env" | "none";
  reason?: string;
}

const TTL_MS = 5 * 60 * 1000;
let cache: { state: AuthConfigState; at: number; etag?: string } | null = null;

function parseConfig(raw: string): AuthConfig {
  const trimmed = raw.trim();
  const json = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
  return configSchema.parse(JSON.parse(json));
}

async function fromPrivateRepo(): Promise<{ config: AuthConfig; etag?: string } | null> {
  const repo = process.env.AOMI_CONFIG_REPO;
  const token = process.env.AOMI_CONFIG_TOKEN;
  if (!repo || !token) return null;
  const path = process.env.AOMI_CONFIG_PATH || "auth.json";
  const ref = process.env.AOMI_CONFIG_REF || "main";
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${ref}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(cache?.etag ? { "If-None-Match": cache.etag } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (response.status === 304 && cache) return { config: cache.state.config as AuthConfig, etag: cache.etag };
  if (!response.ok) throw new Error(`config repo responded ${response.status}`);
  return { config: parseConfig(await response.text()), etag: response.headers.get("etag") || undefined };
}

function fromEnv(): AuthConfig | null {
  const raw = process.env.AOMI_AUTH_JSON;
  if (!raw) return null;
  // A malformed variable must degrade to "no credentials configured", never to a 500
  // on the login page: that would hide the real problem behind an error screen.
  try {
    return parseConfig(raw);
  } catch {
    return null;
  }
}

export async function loadAuthConfig(options: { force?: boolean } = {}): Promise<AuthConfigState> {
  if (!options.force && cache && Date.now() - cache.at < TTL_MS) return cache.state;

  const settle = (state: AuthConfigState) => {
    cache = { state, at: Date.now(), etag: cache?.etag };
    return state;
  };

  try {
    const remote = await fromPrivateRepo();
    if (remote) {
      cache = { state: { config: remote.config, source: "private-repo" }, at: Date.now(), etag: remote.etag };
      return cache.state;
    }
  } catch (error) {
    // A private repo outage must not lock the owner out: fall through to env, then stale cache.
    const reason = error instanceof Error ? error.message : "config repo unavailable";
    const envConfig = fromEnv();
    if (envConfig) return settle({ config: envConfig, source: "env", reason });
    if (cache?.state.config) return settle({ ...cache.state, reason });
    return settle({ config: null, source: "none", reason });
  }

  const envConfig = fromEnv();
  if (envConfig) return settle({ config: envConfig, source: "env" });
  if (cache?.state.config) return settle(cache.state);
  return settle({ config: null, source: "none", reason: "AOMI_CONFIG_REPO/AOMI_CONFIG_TOKEN and AOMI_AUTH_JSON are all unset" });
}

export function findUser(config: AuthConfig | null, username: string): AuthUser | undefined {
  if (!config) return undefined;
  const wanted = username.trim().toLowerCase();
  return config.users.find((user) => user.username.toLowerCase() === wanted);
}

export function sessionSecret(): string | null {
  const secret = process.env.AOMI_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

export function ownerWhatsApp(state: AuthConfigState): string {
  return state.config?.ownerContact?.whatsapp || process.env.AOMI_OWNER_WHATSAPP || "6281249578370";
}
