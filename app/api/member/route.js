// POST: create a nickname account (handle + 18+ confirmation) -> sets the session cookie, returns the recovery code ONCE.
// GET: the signed-in member, or { member: null }.
import { db } from "../../../lib/db.js";
import { validateHandle, generateRecoveryCode, hashRecoveryCode, LIMITS } from "../../../lib/members.js";
import { currentMember, hashedIp, pgStore } from "../../../lib/memberStore.js";
import { json, badRequestOrigin, readJson, setSession, configured } from "../../../lib/api.js";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!configured()) return json({ member: null, error: "Accounts are not available on this deployment yet." }, 503);
  const m = await currentMember();
  return json({ member: m ? { handle: m.handle, createdAt: m.createdAt } : null });
}

export async function POST(req) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  if (!configured()) return json({ error: "Accounts are not available on this deployment yet." }, 503);
  const body = await readJson(req);
  const v = validateHandle(body.handle);
  if (!v.ok) return json({ error: v.error }, 400);
  if (body.confirm18 !== true) return json({ error: "Please confirm you are 18 or older." }, 400);
  if (await currentMember()) return json({ error: "You're already signed in. Sign out first to create another account." }, 409);
  const ip = hashedIp();
  if ((await pgStore.countAll("create_ip", ip, Date.now() - LIMITS.createIp.windowMs)) >= LIMITS.createIp.max)
    return json({ error: "Too many new accounts from this network today. Try again tomorrow." }, 429, { "Retry-After": String(LIMITS.createIp.windowMs / 1000) });
  const code = generateRecoveryCode();
  const rows = await db()`insert into members (handle, recovery_hash, is_18_confirmed)
    values (${v.handle}, ${hashRecoveryCode(code)}, true) on conflict (handle) do nothing
    returning id, handle::text as handle, created_at`;
  if (!rows[0]) return json({ error: "That handle is taken. Try another." }, 409);
  await pgStore.recordAttempt("create_ip", ip, true);
  const res = json({ member: { handle: rows[0].handle, createdAt: rows[0].created_at }, recoveryCode: code }, 201);
  return setSession(res, rows[0].id);
}
