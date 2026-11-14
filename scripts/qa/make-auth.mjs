#!/usr/bin/env node
// Prints a ready-to-use AOMI_AUTH_JSON for local runs: node scripts/qa/make-auth.mjs owner 'password'
import { execFileSync } from "node:child_process";

const username = process.argv[2] || "owner";
const password = process.argv[3];
if (!password) {
  console.error("Usage: node scripts/qa/make-auth.mjs <username> <password>");
  process.exit(1);
}
const scrypt = JSON.parse(execFileSync("node", ["scripts/hash-password.mjs", password], { encoding: "utf8" }));
console.log(
  JSON.stringify({
    version: 1,
    ownerContact: { whatsapp: "6281234567890" },
    users: [{ username, role: "owner", displayName: "QA Owner", scrypt, updatedAt: new Date().toISOString() }],
  }),
);
