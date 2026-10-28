// Player picker: GET ?league=PL&team=57&position=Midfield&q=sak -> up to 60 players from the cached squads.
import { LEAGUES } from "../../../../lib/data.js";
import { competitionTeams } from "../../../../lib/fdStore.js";
import { lineOf } from "../../../../lib/fantasy.js";
import { etagJson } from "../../../../lib/http.js";
export const dynamic = "force-dynamic";
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export async function GET(req) {
  const sp = new URL(req.url).searchParams, code = sp.get("league");
  if (!process.env.DATABASE_URL || !LEAGUES.some((l) => l.fd === code)) return Response.json({ error: "Pick a league." }, { status: 400 });
  try {
    const r = await competitionTeams(code); const team = Number(sp.get("team")) || null, pos = sp.get("position"), q = fold(sp.get("q")).slice(0, 30);
    const out = [];
    for (const t of r.body) { if (team && t.id !== team) continue;
      for (const p of t.squad) { if (pos && lineOf(p.position) !== pos) continue; if (q && !fold(p.name).includes(q)) continue;
        out.push({ player_id: p.id, name: p.name, position: p.position, line: lineOf(p.position), team_id: t.id, team: t.short, crest: t.crest, competition: code }); } }
    out.sort((a, b) => a.team.localeCompare(b.team) || a.line.localeCompare(b.line) || a.name.localeCompare(b.name));
    return etagJson(req, { players: out.slice(0, 60), total: out.length, stale: r.stale }, { cdn: 600, swr: 3600 });
  } catch (e) { return Response.json({ error: "Player data unavailable right now." }, { status: 503, headers: { "Retry-After": "10" } }); }
}
