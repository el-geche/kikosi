// POST { handle, code }: restore an account on this device. Rate-limited per handle and per network.
import { restoreMember } from "../../../../lib/members.js";
import { hashedIp, pgStore } from "../../../../lib/memberStore.js";
import { json, badRequestOrigin, readJson, setSession, configured } from "../../../../lib/api.js";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  if (!configured()) return json({ error: "Accounts are not available on this deployment yet." }, 503);
  const body = await readJson(req);
  const r = await restoreMember(pgStore, { handle: body.handle, code: body.code, ip: hashedIp() });
  if (r.status !== 200) return json({ error: r.error }, r.status, r.retryAfter ? { "Retry-After": String(r.retryAfter) } : {});
  return setSession(json({ member: { handle: r.member.handle } }), r.member.id);
}
