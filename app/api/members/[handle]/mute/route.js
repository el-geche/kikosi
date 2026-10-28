// POST { on: true|false } -> hide (or unhide) this member's comments for you.
import { json, badRequestOrigin, readJson, configured } from "../../../../../lib/api.js";
import { currentMember } from "../../../../../lib/memberStore.js";
import { setMute } from "../../../../../lib/socialStore.js";
export const dynamic = "force-dynamic";
export async function POST(req, { params }) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  if (!configured()) return json({ error: "Not available." }, 503);
  const m = await currentMember(); if (!m) return json({ error: "Sign in first." }, 401);
  const r = await setMute(m.id, decodeURIComponent(params.handle).slice(0, 20), (await readJson(req)).on !== false);
  return r.ok ? json(r) : json({ error: r.error }, 400);
}
