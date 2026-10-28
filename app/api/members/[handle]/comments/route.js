// POST { body } -> comment (max 140 chars, filtered, 10 per 10 min) on a member's wall; returns the realtime event.
import { json, badRequestOrigin, readJson, configured } from "../../../../../lib/api.js";
import { currentMember } from "../../../../../lib/memberStore.js";
import { addComment } from "../../../../../lib/socialStore.js";
export const dynamic = "force-dynamic";
export async function POST(req, { params }) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  if (!configured()) return json({ error: "Not available." }, 503);
  const m = await currentMember(); if (!m) return json({ error: "Create a free account to comment." }, 401);
  const r = await addComment(m, decodeURIComponent(params.handle).slice(0, 20), (await readJson(req)).body);
  return r.ok ? json(r, 201) : json({ error: r.error }, r.status || 400);
}
