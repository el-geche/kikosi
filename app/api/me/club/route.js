// POST { teamId: number | null } -> set (or clear) your favourite club.
import { json, badRequestOrigin, readJson, configured } from "../../../../lib/api.js";
import { currentMember } from "../../../../lib/memberStore.js";
import { setFavTeam } from "../../../../lib/fantasyStore.js";
export const dynamic = "force-dynamic";
export async function POST(req) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  if (!configured()) return json({ error: "Not available." }, 503);
  const m = await currentMember(); if (!m) return json({ error: "Sign in first." }, 401);
  const b = await readJson(req), id = b.teamId === null ? null : Number(b.teamId);
  if (id !== null && !Number.isInteger(id)) return json({ error: "Pick a club." }, 400);
  try { const r = await setFavTeam(m.id, id); return r.ok ? json(r) : json({ error: r.error }, 400); }
  catch { return json({ error: "Club data unavailable right now, try again shortly." }, 503); }
}
