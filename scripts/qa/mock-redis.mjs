#!/usr/bin/env node
/**
 * In-memory stand-in for the Upstash REST API, used only by the local QA harness.
 *
 * It exists so the purchase flow can be exercised end to end without writing a single key
 * into the production database. It implements the subset of commands this app actually
 * issues, plus the two Lua scripts it relies on (the rate-limit INCR+EXPIRE and the atomic
 * "mark paid" transition), which are recognised by shape and mirrored in plain JS.
 *
 * Usage: node scripts/qa/mock-redis.mjs [port]
 */
import { createServer } from "node:http";

const PORT = Number(process.argv[2] || 6391);

const store = new Map(); // key -> { kind, value | map | list | zset }
const expiry = new Map(); // key -> epoch ms

function alive(key) {
  const until = expiry.get(key);
  if (until && until <= Date.now()) {
    store.delete(key);
    expiry.delete(key);
    return false;
  }
  return store.has(key);
}

function getEntry(key) {
  if (!alive(key)) return null;
  return store.get(key) || null;
}

function asString(entry, key) {
  if (!entry) return null;
  if (entry.kind !== "string") throw new Error(`WRONGTYPE ${key}`);
  return entry.value;
}

function asHash(entry, key) {
  if (!entry) {
    const created = { kind: "hash", map: new Map() };
    store.set(key, created);
    return created.map;
  }
  if (entry.kind !== "hash") throw new Error(`WRONGTYPE ${key}`);
  return entry.map;
}

function asZset(entry, key) {
  if (!entry) {
    const created = { kind: "zset", zset: new Map() };
    store.set(key, created);
    return created.zset;
  }
  if (entry.kind !== "zset") throw new Error(`WRONGTYPE ${key}`);
  return entry.zset;
}

function asList(entry, key) {
  if (!entry) {
    const created = { kind: "list", list: [] };
    store.set(key, created);
    return created.list;
  }
  if (entry.kind !== "list") throw new Error(`WRONGTYPE ${key}`);
  return entry.list;
}

function setTtl(key, seconds) {
  const ttl = Number(seconds);
  if (ttl > 0) expiry.set(key, Date.now() + ttl * 1000);
  else expiry.delete(key);
}

function run(args) {
  const command = String(args[0] || "").toUpperCase();
  const key = String(args[1] ?? "");

  switch (command) {
    case "PING":
      return "PONG";
    case "SET": {
      const options = args.slice(3).map((value) => String(value).toUpperCase());
      const nx = options.includes("NX");
      const exIndex = options.indexOf("EX");
      if (nx && alive(key)) return null;
      store.set(key, { kind: "string", value: String(args[2] ?? "") });
      // sliced index i maps to args index i + 3, so the TTL value sits at i + 4
      if (exIndex >= 0) setTtl(key, args[4 + exIndex]);
      return "OK";
    }
    case "GET":
      return asString(getEntry(key), key);
    case "DEL": {
      let removed = 0;
      for (const target of args.slice(1).map(String)) {
        if (alive(target)) removed += 1;
        store.delete(target);
        expiry.delete(target);
      }
      return removed;
    }
    case "EXISTS":
      return alive(key) ? 1 : 0;
    case "EXPIRE": {
      if (!alive(key)) return 0;
      setTtl(key, args[2]);
      return 1;
    }
    case "TTL": {
      const until = expiry.get(key);
      if (!until) return -1;
      return Math.max(0, Math.round((until - Date.now()) / 1000));
    }
    case "INCR":
    case "INCRBY": {
      const current = Number(asString(getEntry(key), key) || 0);
      const next = current + (command === "INCR" ? 1 : Number(args[2] || 1));
      store.set(key, { kind: "string", value: String(next) });
      return next;
    }
    case "HINCRBY": {
      const hash = asHash(getEntry(key), key);
      const field = String(args[2]);
      const next = Number(hash.get(field) || 0) + Number(args[3] || 1);
      hash.set(field, String(next));
      return next;
    }
    case "HSET": {
      const hash = asHash(getEntry(key), key);
      let added = 0;
      for (let index = 2; index + 1 < args.length; index += 2) {
        const field = String(args[index]);
        if (!hash.has(field)) added += 1;
        hash.set(field, String(args[index + 1]));
      }
      return added;
    }
    case "HSETNX": {
      const hash = asHash(getEntry(key), key);
      const field = String(args[2]);
      if (hash.has(field)) return 0;
      hash.set(field, String(args[3]));
      return 1;
    }
    case "HGET": {
      const hash = asHash(getEntry(key), key);
      return hash.has(String(args[2])) ? hash.get(String(args[2])) : null;
    }
    case "HGETALL": {
      const entry = getEntry(key);
      if (!entry) return [];
      const hash = asHash(entry, key);
      return [...hash.entries()].flatMap(([field, value]) => [field, value]);
    }
    case "HDEL": {
      const hash = asHash(getEntry(key), key);
      return args.slice(2).reduce((count, field) => count + (hash.delete(String(field)) ? 1 : 0), 0);
    }
    case "SADD": {
      const entry = getEntry(key);
      const set = entry ? entry.set || (entry.set = new Set()) : (() => {
        const created = { kind: "set", set: new Set() };
        store.set(key, created);
        return created.set;
      })();
      let added = 0;
      for (const member of args.slice(2).map(String)) {
        if (!set.has(member)) added += 1;
        set.add(member);
      }
      return added;
    }
    case "SMEMBERS": {
      const entry = getEntry(key);
      return entry?.set ? [...entry.set] : [];
    }
    case "SCARD": {
      const entry = getEntry(key);
      return entry?.set ? entry.set.size : 0;
    }
    case "SREM": {
      const entry = getEntry(key);
      if (!entry?.set) return 0;
      return args.slice(2).reduce((count, member) => count + (entry.set.delete(String(member)) ? 1 : 0), 0);
    }
    case "LPUSH": {
      const entry = getEntry(key);
      const list = entry ? entry.list || (entry.list = []) : (() => {
        const created = { kind: "list", list: [] };
        store.set(key, created);
        return created.list;
      })();
      list.unshift(...args.slice(2).map(String));
      return list.length;
    }
    case "LRANGE": {
      const entry = getEntry(key);
      const list = entry?.list || [];
      const start = Number(args[2]);
      const stop = Number(args[3]);
      const end = stop < 0 ? list.length + stop : stop;
      const from = start < 0 ? Math.max(0, list.length + start) : start;
      return list.slice(from, end + 1);
    }
    case "LTRIM": {
      const entry = getEntry(key);
      if (!entry?.list) return "OK";
      const start = Number(args[2]);
      const stop = Number(args[3]);
      const end = stop < 0 ? entry.list.length + stop : stop;
      entry.list = entry.list.slice(start, end + 1);
      return "OK";
    }
    case "ZADD": {
      const zset = asZset(getEntry(key), key);
      const score = Number(args[2]);
      const member = String(args[3]);
      const added = zset.has(member) ? 0 : 1;
      zset.set(member, score);
      return added;
    }
    case "ZREVRANGE":
    case "ZRANGE": {
      const entry = getEntry(key);
      if (!entry?.zset) return [];
      const rows = [...entry.zset.entries()].sort((a, b) => (command === "ZRANGE" ? a[1] - b[1] : b[1] - a[1]));
      const start = Number(args[2]);
      const stop = Number(args[3]);
      const end = stop < 0 ? rows.length + stop : stop;
      return rows.slice(start, end + 1).map(([member]) => member);
    }
    case "ZSCORE": {
      const entry = getEntry(key);
      return entry?.zset?.get(String(args[2])) ?? null;
    }
    case "ZREM": {
      const entry = getEntry(key);
      return entry?.zset?.delete(String(args[2])) ? 1 : 0;
    }
    case "SCAN": {
      const pattern = args.includes("MATCH") ? String(args[args.indexOf("MATCH") + 1]) : "*";
      const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      const keys = [...store.keys()].filter((candidate) => alive(candidate) && regex.test(candidate));
      return ["0", keys];
    }
    case "EVAL": {
      const script = String(args[1]);
      const keyCount = Number(args[2]);
      const keys = args.slice(3, 3 + keyCount).map(String);
      const argv = args.slice(3 + keyCount).map(String);

      // Mirrors src/lib/db/apikeys.ts incrWithTtl.
      if (script.includes("INCR") && script.includes("EXPIRE")) {
        const current = Number(asString(getEntry(keys[0]), keys[0]) || 0) + 1;
        store.set(keys[0], { kind: "string", value: String(current) });
        if (current === 1) setTtl(keys[0], argv[0]);
        const until = expiry.get(keys[0]);
        return [current, until ? Math.max(0, Math.round((until - Date.now()) / 1000)) : -1];
      }

      // Mirrors src/lib/db/orders.ts markPaid.
      if (script.includes("status") && script.includes("paid")) {
        const entry = getEntry(keys[0]);
        if (!entry) return "missing";
        const hash = asHash(entry, keys[0]);
        if (hash.get("status") === "paid") {
          hash.set("updatedAt", argv[3]);
          return "already";
        }
        hash.set("status", "paid");
        hash.set("paidAt", argv[0]);
        hash.set("settledBy", argv[1]);
        hash.set("updatedAt", argv[3]);
        if (argv[2]) hash.set("payableAmount", argv[2]);
        return "paid";
      }

      throw new Error("mock redis: unhandled script");
    }
    default:
      throw new Error(`mock redis: unsupported command ${command}`);
  }
}

function handle(payload) {
  try {
    if (Array.isArray(payload) && Array.isArray(payload[0])) {
      return payload.map((args) => ({ result: run(args) }));
    }
    return { result: run(payload) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "mock redis error" };
  }
}

createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    if (request.method === "POST" && request.url?.startsWith("/_qa/reset")) {
      store.clear();
      expiry.clear();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.method === "GET") {
      // `/_qa/dump` lets the test read raw rows to prove no plaintext password is stored.
      const dump = {};
      for (const [key, entry] of store.entries()) {
        if (!alive(key)) continue;
        if (entry.kind === "hash") dump[key] = Object.fromEntries(entry.map);
        else if (entry.kind === "string") dump[key] = entry.value;
        else if (entry.kind === "list") dump[key] = entry.list;
        else if (entry.kind === "set") dump[key] = [...entry.set];
        else if (entry.kind === "zset") dump[key] = Object.fromEntries(entry.zset);
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, keys: store.size, dump }));
      return;
    }
    let payload;
    try {
      payload = JSON.parse(body || "[]");
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "bad json" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(handle(payload)));
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`mock redis on http://127.0.0.1:${PORT}`);
});
