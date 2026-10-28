// GET -> your squad + analysis. PUT { name, players: [{ player_id, team_id, competition, slot, x, y }] } -> save.
import { json, badRequestOrigin, readJson, configured } from "../../../lib/api.js";
import { currentMember } from "../../../lib/memberStore.js";
import { getSquad, saveSquad, squadAnalysis } from "../../../lib/fantasyStore.js";
import { validateSquad } from "../../../lib/fantasy.js";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET() {
  if (!configured()) return json({ error: "Not available." }, 503);
  const m = await currentMember(); if (!m) return json({ error: "Sign in first." }, 401);
  const s = await getSquad(m.id);
  return json({ ...s, validation: validateSquad(s.players), analysis: s.players.length ? await squadAnalysis(s.players) : null });
}
export async function PUT(req) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  if (!configured()) return json({ error: "Not available." }, 503);
  const m = await currentMember(); if (!m) return json({ error: "Sign in first." }, 401);
  const b = await readJson(req);
  try {
    const r = await saveSquad(m.id, b.name, b.players);
    if (!r.ok) return json({ error: r.errors[0], errors: r.errors, warnings: r.warnings || [] }, 400);
    return json({ ok: true, warnings: r.warnings, analysis: await squadAnalysis(r.players) });
  } catch (e) { return json({ error: "Player data unavailable right now, try again shortly." }, 503); }
}
