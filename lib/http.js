// HTTP helpers for public GET APIs: ETag/304, CDN cache headers, a small in-memory rate limiter.
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const etagOf = (body) => `W/"${createHash("sha1").update(typeof body === "string" ? body : JSON.stringify(body)).digest("base64url").slice(0, 22)}"`;
/** True when the client's If-None-Match matches (weak comparison, comma lists and * supported). */
export function etagMatches(header, tag) {
  if (!header) return false;
  const strip = (t) => t.trim().replace(/^W\//, "");
  return header.split(",").some((t) => t.trim() === "*" || strip(t) === strip(tag));
}
/**
 * JSON with an ETag; answers 304 when unchanged. `cdn` seconds > 0 adds a shared-cache (Vercel CDN) s-maxage with
 * stale-while-revalidate; use it ONLY for responses that contain no personalised data.
 */
export function etagJson(req, body, { cdn = 0, swr = 30, status = 200 } = {}) {
  const text = JSON.stringify(body), tag = etagOf(text);
  const cc = cdn > 0 ? `public, max-age=0, s-maxage=${cdn}, stale-while-revalidate=${swr}` : "private, no-cache";
  const headers = { ETag: tag, "Cache-Control": cc };
  if (cdn > 0) headers["CDN-Cache-Control"] = `public, s-maxage=${cdn}, stale-while-revalidate=${swr}`;
  if (status === 200 && etagMatches(req.headers.get("if-none-match"), tag)) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(text, { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}

const buckets = (globalThis.__kikosiRl ??= new Map());
/** Fixed-window limiter per instance (the CDN cache in front absorbs most traffic). */
export function rateLimited(key, max, windowMs, now = Date.now()) {
  const b = buckets.get(key);
  if (!b || now - b.start >= windowMs) { buckets.set(key, { start: now, n: 1 }); if (buckets.size > 5000) buckets.clear(); return false; }
  b.n++; return b.n > max;
}
export const clientIpOf = (req) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
