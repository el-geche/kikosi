// POST { emoji, matchId?, want?: "on"|"off" } -> toggles one reaction; returns the new count and the realtime event.
import { json, badRequestOrigin, readJson, configured } from "../../../../../lib/api.js";
import { currentMember } from "../../../../../lib/memberStore.js";
import { react } from "../../../../../lib/socialStore.js";
import { rateLimited } from "../../../../../lib/http.js";
export const dynamic = "force-dynamic";
export async function POST(req, { params }) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  if (!configured()) return json({ error: "Not available." }, 503);
  const m = await currentMember(); if (!m) return json({ error: "Create a free account to react." }, 401);
  if (rateLimited(`react:${m.id}`, 60, 60e3)) return json({ error: "Too many reactions, slow down." }, 429);
  const b = await readJson(req);
  const matchId = b.matchId == null ? null : Number(b.matchId);
  if (matchId != null && !Number.isInteger(matchId)) return json({ error: "Bad match." }, 400);
  const r = await react(m.id, decodeURIComponent(params.handle).slice(0, 20), matchId, String(b.emoji || ""), b.want);
  return r.ok ? json(r) : json({ error: r.error }, 400);
}
