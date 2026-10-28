// Nickname accounts: handle rules, recovery codes, signed session cookies and the restore rate limit.
// Pure Node crypto with no Next.js or database imports, so it can be unit-tested with node:test.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const COOKIE = "kikosi_member";
export const COOKIE_MAX_AGE = 400 * 24 * 3600; // seconds; browsers cap cookie lifetime at 400 days
export const COMPLIANCE = "A free prediction game for fun. Not betting. No money in, no money out.";

// ---- Handles -------------------------------------------------------------------------------------
const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;
const RESERVED = ["admin", "administrator", "kikosi", "pitchlens", "moderator", "mod", "support", "staff", "official", "system",
  "root", "null", "undefined", "me", "api", "bclb", "gra", "help", "team", "owner"];
// Substrings blocked after leetspeak folding (English + Kiswahili slurs/obscenities and betting/money bait).
// Kept short on purpose: common names such as Dickson, Nazir or Albert must still pass.
const BLOCKED = ["fuck", "shit", "cunt", "bitch", "nigg", "faggot", "porn", "pussy", "whore", "slut", "hitler",
  "malaya", "msenge", "kumamako", "matako", "shoga", "jackpot", "mpesa", "casino", "betting", "sportpesa"];
const fold = (s) => s.toLowerCase().replace(/_/g, "").replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
  .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b").replace(/\$/g, "s").replace(/@/g, "a");

/** Returns { ok: true, handle } (trimmed) or { ok: false, error } with a user-facing message. */
export function validateHandle(input) {
  const handle = typeof input === "string" ? input.trim() : "";
  if (handle.length < 3 || handle.length > 20) return { ok: false, error: "Handle must be 3–20 characters." };
  if (!HANDLE_RE.test(handle)) return { ok: false, error: "Use only letters, numbers and underscores." };
  if (/^_|_$|__/.test(handle)) return { ok: false, error: "Underscores can't start, end or repeat." };
  if (/^\d+$/.test(handle)) return { ok: false, error: "Handle needs at least one letter." };
  const f = fold(handle);
  if (RESERVED.includes(handle.toLowerCase()) || RESERVED.includes(f)) return { ok: false, error: "That handle is reserved." };
  if (BLOCKED.some((w) => f.includes(w))) return { ok: false, error: "Please choose a different handle." };
  return { ok: true, handle };
}

// ---- Recovery codes ------------------------------------------------------------------------------
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, no 0/O/1/I
/** 16 random symbols (80 bits) shown as XXXX-XXXX-XXXX-XXXX. */
export function generateRecoveryCode() {
  const b = randomBytes(16);
  const s = Array.from(b, (x) => ALPHABET[x & 31]).join("");
  return s.match(/.{4}/g).join("-");
}
/** Upper-cases and drops dashes/spaces, so "abcd efgh-..." and "ABCD-EFGH-..." verify the same. */
export const normalizeCode = (code) => String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const SCRYPT = { N: 16384, r: 8, p: 1 };
/** scrypt$<salt b64url>$<hash b64url> */
export function hashRecoveryCode(code) {
  const salt = randomBytes(16);
  const h = scryptSync(normalizeCode(code), salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${h.toString("base64url")}`;
}
export function verifyRecoveryCode(code, stored) {
  if (typeof stored !== "string") return false;
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const n = normalizeCode(code);
  if (n.length !== 16) return false;
  const expected = Buffer.from(hash, "base64url");
  const got = scryptSync(n, Buffer.from(salt, "base64url"), expected.length, SCRYPT);
  return timingSafeEqual(got, expected);
}

// ---- Signed session cookie -----------------------------------------------------------------------
const mac = (payload, secret) => createHmac("sha256", secret).update(payload).digest("base64url");
function needSecret(secret) { if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is missing or too short"); return secret; }
/** Cookie value: v1.<memberId>.<issuedAt seconds>.<HMAC-SHA256> */
export function signSession(memberId, secret, now = Date.now()) {
  const payload = `v1.${memberId}.${Math.floor(now / 1000)}`;
  return `${payload}.${mac(payload, needSecret(secret))}`;
}
/** Returns the member id, or null if the value is malformed, tampered with or expired. */
export function verifySession(value, secret, now = Date.now()) {
  if (typeof value !== "string" || !secret) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [v, id, iat, sig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d+$/.test(iat)) return null;
  const want = Buffer.from(mac(`${v}.${id}.${iat}`, secret)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (now / 1000 - Number(iat) > COOKIE_MAX_AGE) return null;
  return id;
}
export const cookieOptions = (secure = true) => ({ httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: COOKIE_MAX_AGE });

/** HMAC of a client IP so raw IPs are never stored. */
export const ipKey = (ip, secret) => createHmac("sha256", needSecret(secret)).update(`ip:${ip || "unknown"}`).digest("base64url").slice(0, 32);

// ---- Rate limits ---------------------------------------------------------------------------------
export const LIMITS = {
  restoreHandle: { max: 5, windowMs: 15 * 60e3 }, // failed restores per handle
  restoreIp: { max: 20, windowMs: 60 * 60e3 },    // failed restores per IP
  createIp: { max: 10, windowMs: 24 * 3600e3 },   // accounts created per IP
};
/** Decides whether a restore may be attempted, given recent failure counts. */
export function restoreAllowed({ handleFails, ipFails }) {
  if (handleFails >= LIMITS.restoreHandle.max) return { ok: false, retryAfter: LIMITS.restoreHandle.windowMs / 1000 };
  if (ipFails >= LIMITS.restoreIp.max) return { ok: false, retryAfter: LIMITS.restoreIp.windowMs / 1000 };
  return { ok: true };
}

/**
 * Restore flow with an injected store, so the same logic runs against Postgres in production and memory in tests.
 * store: { countFailures(kind, key, sinceMs), recordAttempt(kind, key, ok), findByHandle(handle) -> {id, handle, recovery_hash, banned} | null }
 * Returns { status: 200, member } | { status: 400|401|429, error, retryAfter? }. Wrong handle and wrong code look the same.
 */
export async function restoreMember(store, { handle, code, ip }, now = Date.now()) {
  const h = typeof handle === "string" ? handle.trim().toLowerCase() : "";
  if (!h || h.length > 20 || !code) return { status: 400, error: "Enter your handle and recovery code." };
  const [handleFails, ipFails] = await Promise.all([
    store.countFailures("restore_handle", h, now - LIMITS.restoreHandle.windowMs),
    store.countFailures("restore_ip", ip, now - LIMITS.restoreIp.windowMs),
  ]);
  const gate = restoreAllowed({ handleFails, ipFails });
  if (!gate.ok) return { status: 429, error: "Too many attempts. Try again later.", retryAfter: gate.retryAfter };
  const m = await store.findByHandle(h);
  const ok = !!m && !m.banned && verifyRecoveryCode(code, m.recovery_hash);
  await Promise.all([store.recordAttempt("restore_handle", h, ok), store.recordAttempt("restore_ip", ip, ok)]);
  if (!ok) return { status: 401, error: "That handle and recovery code don't match." };
  return { status: 200, member: { id: m.id, handle: m.handle } };
}
