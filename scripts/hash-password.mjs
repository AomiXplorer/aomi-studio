#!/usr/bin/env node
// Turns a password into the scrypt record that belongs in the private auth config.
// Usage: node scripts/hash-password.mjs 'the password'
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs 'password'");
  process.exit(1);
}

const params = { n: 16384, r: 8, p: 1 };
const salt = randomBytes(16);
const key = scryptSync(password.normalize("NFKC"), salt, 32, { N: params.n, r: params.r, p: params.p, maxmem: 128 * 1024 * 1024 });

// Prove the record reproduces the same key before printing it.
const again = scryptSync(password.normalize("NFKC"), salt, 32, { N: params.n, r: params.r, p: params.p, maxmem: 128 * 1024 * 1024 });
if (!timingSafeEqual(key, again)) {
  console.error("hash mismatch, refusing to print");
  process.exit(1);
}

console.log(JSON.stringify({ n: params.n, r: params.r, p: params.p, salt: salt.toString("base64"), key: key.toString("base64") }, null, 2));
