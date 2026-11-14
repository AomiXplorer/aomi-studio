/**
 * Resolves which provider key this request must use and installs it for the adapter.
 *
 * Order: the active key an administrator set (encrypted in Redis) first, the deployment
 * environment variable second. Adding or switching a key therefore takes effect on the
 * very next request without a redeploy, and a fresh deployment still works from env.
 */
import { resolveProviderKey } from "@/lib/db/apikeys";
import { redisConfigured } from "@/lib/db/redis";
import { setRuntimeApiKey } from "./config";

export interface KeyResolution {
  source: "database" | "env" | "none";
  keyId?: string;
  present: boolean;
}

export async function applyProviderKey(): Promise<KeyResolution> {
  if (!redisConfigured()) {
    const env = (process.env.BANGUNWEB_API_KEY || "").trim();
    setRuntimeApiKey(env || null);
    return { source: env ? "env" : "none", present: Boolean(env) };
  }
  try {
    const resolved = await resolveProviderKey();
    setRuntimeApiKey(resolved.key);
    return { source: resolved.source, keyId: resolved.keyId, present: Boolean(resolved.key) };
  } catch {
    // A database hiccup must not take the whole app down: fall back to the env key.
    const env = (process.env.BANGUNWEB_API_KEY || "").trim();
    setRuntimeApiKey(env || null);
    return { source: env ? "env" : "none", present: Boolean(env) };
  }
}
