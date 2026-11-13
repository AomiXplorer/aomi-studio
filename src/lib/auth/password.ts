import { scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export interface ScryptRecord {
  n: number;
  r: number;
  p: number;
  salt: string;
  key: string;
}

export const DEFAULT_SCRYPT = { n: 16384, r: 8, p: 1 } as const;

/** Used when the username does not exist, so a miss costs the same time as a hit. */
const DECOY: ScryptRecord = {
  n: DEFAULT_SCRYPT.n,
  r: DEFAULT_SCRYPT.r,
  p: DEFAULT_SCRYPT.p,
  salt: "AAAAAAAAAAAAAAAAAAAAAA==",
  key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

export async function verifyPassword(password: string, record: ScryptRecord | undefined): Promise<boolean> {
  const target = record ?? DECOY;
  const salt = Buffer.from(target.salt, "base64");
  const expected = Buffer.from(target.key, "base64");
  const derived = await scryptAsync(password.normalize("NFKC"), salt, expected.length || 32, {
    N: target.n,
    r: target.r,
    p: target.p,
    maxmem: 128 * 1024 * 1024,
  });
  if (derived.length !== expected.length) return false;
  const equal = timingSafeEqual(derived, expected);
  // A missing record must never authenticate, whatever the hash compared to.
  return equal && Boolean(record);
}
