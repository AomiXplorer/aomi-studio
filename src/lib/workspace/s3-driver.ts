import { createHash, createHmac } from "node:crypto";
import type { BlobStore } from "./store";

/**
 * S3-compatible object storage driver (AWS S3, Cloudflare R2, Backblaze B2,
 * MinIO, Supabase storage S3). Uses path-style URLs and Signature V4 so no SDK
 * is needed in the serverless bundle.
 *
 * Required env: S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY. Optional: S3_PREFIX, S3_FORCE_PATH_STYLE.
 */
const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

export class S3BlobStore implements BlobStore {
  readonly driver = "s3";
  readonly persistent = true;
  private endpoint: string;
  private region: string;
  private bucket: string;
  private accessKey: string;
  private secretKey: string;
  private prefix: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT || "";
    const bucket = process.env.S3_BUCKET || "";
    const accessKey = process.env.S3_ACCESS_KEY_ID || "";
    const secretKey = process.env.S3_SECRET_ACCESS_KEY || "";
    if (!endpoint || !bucket || !accessKey || !secretKey) {
      throw new Error("AOMI_STORAGE=s3 butuh S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.");
    }
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.region = process.env.S3_REGION || "auto";
    this.bucket = bucket;
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.prefix = (process.env.S3_PREFIX || "aomi").replace(/^\/+|\/+$/g, "");
  }

  private fullKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  private sign(method: string, key: string, query: Record<string, string>, body: Uint8Array | null, contentType?: string) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = `/${this.bucket}/${encodeKey(key)}`;
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(query[name])}`)
      .join("&");
    const payloadHash = sha256Hex(body ?? "");
    const headers: Record<string, string> = {
      host: new URL(this.endpoint).host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (contentType) headers["content-type"] = contentType;
    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((name) => `${name}:${headers[name]}\n`)
      .join("");
    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.secretKey}`, dateStamp), this.region), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return headers;
  }

  private async request(method: string, key: string, options: { query?: Record<string, string>; body?: Uint8Array; contentType?: string } = {}) {
    const query = options.query ?? {};
    const headers = this.sign(method, key, query, options.body ?? null, options.contentType);
    const search = Object.keys(query).length
      ? `?${Object.keys(query)
          .sort()
          .map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(query[name])}`)
          .join("&")}`
      : "";
    return fetch(`${this.endpoint}/${this.bucket}/${encodeKey(key)}${search}`, {
      method,
      headers,
      body: options.body ? new Blob([options.body as unknown as BlobPart]) : undefined,
    });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const res = await this.request("GET", this.fullKey(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET ${res.status}: ${await res.text()}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async put(key: string, data: Uint8Array, contentType = "application/octet-stream"): Promise<void> {
    const res = await this.request("PUT", this.fullKey(key), { body: data, contentType });
    if (!res.ok) throw new Error(`S3 PUT ${res.status}: ${await res.text()}`);
  }

  async delete(key: string): Promise<void> {
    const res = await this.request("DELETE", this.fullKey(key));
    if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE ${res.status}`);
  }

  async list(prefix: string): Promise<string[]> {
    const results: string[] = [];
    let token: string | undefined;
    do {
      const query: Record<string, string> = { "list-type": "2", prefix: this.fullKey(prefix) };
      if (token) query["continuation-token"] = token;
      const res = await this.request("GET", "", { query });
      if (!res.ok) throw new Error(`S3 LIST ${res.status}: ${await res.text()}`);
      const xml = await res.text();
      for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) {
        const key = decodeURIComponent(match[1]);
        results.push(this.prefix && key.startsWith(`${this.prefix}/`) ? key.slice(this.prefix.length + 1) : key);
      }
      token = xml.includes("<IsTruncated>true</IsTruncated>")
        ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
        : undefined;
    } while (token);
    return results;
  }
}
