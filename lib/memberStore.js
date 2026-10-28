// Database side of nickname accounts. Server-only.
import { cookies, headers } from "next/headers";
import { db } from "./db.js";
import { COOKIE, verifySession, ipKey } from "./members.js";

export const secret = () => process.env.SESSION_SECRET;
export function clientIp() {
  const h = headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}
export const hashedIp = () => ipKey(clientIp(), secret());

/** The signed-in member ({ id, handle, createdAt }) or null. */
export async function currentMember() {
  const id = verifySession(cookies().get(COOKIE)?.value, secret());
  if (!id) return null;
  const rows = await db()`select id, handle::text as handle, created_at from members where id = ${id} and not banned`;
  return rows[0] ? { id: rows[0].id, handle: rows[0].handle, createdAt: rows[0].created_at } : null;
}

export const pgStore = {
  async countFailures(kind, key, sinceMs) {
    const r = await db()`select count(*)::int as n from auth_attempts where kind = ${kind} and key = ${key} and not ok and at > ${new Date(sinceMs).toISOString()}`;
    return r[0].n;
  },
  async countAll(kind, key, sinceMs) {
    const r = await db()`select count(*)::int as n from auth_attempts where kind = ${kind} and key = ${key} and at > ${new Date(sinceMs).toISOString()}`;
    return r[0].n;
  },
  async recordAttempt(kind, key, ok) { await db()`insert into auth_attempts (kind, key, ok) values (${kind}, ${key}, ${ok})`; },
  async findByHandle(handle) {
    const r = await db()`select id, handle::text as handle, recovery_hash, banned from members where handle = ${handle}`;
    return r[0] || null;
  },
};
