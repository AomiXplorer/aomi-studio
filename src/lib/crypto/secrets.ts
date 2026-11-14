/**
 * Authenticated encryption for provider API keys.
 *
 * AES-256-GCM, one key from AOMI_ENCRYPTION_KEY (base64 of 32 bytes, or any string
 * that is stretched with SHA-256). The key lives only in the environment, never in
 * Redis, so a database dump on its own does not expose a single key. Every record
 * carries its own IV and tag; a tampered ciphertext fails to decrypt instead of
 * returning garbage.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALGO = "aes-256-gcm";

export class CryptoError extends Error {}

function keyMaterial(): Buffer {
  const raw = (process.env.AOMI_ENCRYPTION_KEY || "").trim();
  if (!raw) throw new CryptoError("AOMI_ENCRYPTION_KEY belum diatur di server.");
  if (/^[A-Za-z0-9+/=]{40,}$/.test(raw)) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptionReady(): boolean {
  try {
    keyMaterial();
    return true;
  } catch {
    return false;
  }
}

export interface SealedSecret {
  cipher: string;
  iv: string;
  tag: string;
}

export function sealSecret(plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    cipher: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function openSecret(record: Partial<SealedSecret> | null | undefined): string {
  if (!record?.cipher || !record.iv || !record.tag) throw new CryptoError("Rekaman kunci tidak lengkap.");
  const decipher = createDecipheriv(ALGO, keyMaterial(), Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(record.cipher, "base64")), decipher.final()]).toString("utf8");
}

/** `bwr-live-9f2ab...` becomes `bwr-****ab`, never the whole value. */
export function maskSecret(value: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "(empty)";
  if (trimmed.length <= 8) return "*".repeat(trimmed.length);
  const head = trimmed.slice(0, /^[a-z]+[-_]/i.test(trimmed) ? trimmed.indexOf("-") + 1 || 4 : 3);
  return `${head}****${trimmed.slice(-4)}`;
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function sameFingerprint(a: string, b: string): boolean {
  const left = Buffer.from(fingerprint(a));
  const right = Buffer.from(fingerprint(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
