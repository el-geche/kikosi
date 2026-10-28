// GET ?league=PL -> clubs (id, name, short, crest), or with &team=ID the club's squad (id, name, position).
// Same for everyone: CDN-cached for 10 min; upstream is the 24 h Neon cache + shared football-data budget.
import { LEAGUES } from "../../../lib/data.js";
import { competitionTeams } from "../../../lib/fdStore.js";
import { etagJson } from "../../../lib/http.js";
export const dynamic = "force-dynamic";
export async function GET(req) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Not available." }, { status: 503 });
  const sp = new URL(req.url).searchParams, code = sp.get("league");
  if (!LEAGUES.some((l) => l.fd === code)) return Response.json({ leagues: LEAGUES.map((l) => ({ code: l.fd, name: l.name, flag: l.flag })) });
  try {
    const r = await competitionTeams(code), team = Number(sp.get("team"));
    if (team) { const t = r.body.find((x) => x.id === team); if (!t) return Response.json({ error: "Unknown club." }, { status: 404 });
      return etagJson(req, { team: { id: t.id, name: t.name, short: t.short, crest: t.crest }, squad: t.squad, fetchedAt: r.fetchedAt, stale: r.stale }, { cdn: 600, swr: 3600 }); }
    return etagJson(req, { league: code, clubs: r.body.map(({ squad, ...t }) => ({ ...t, players: squad.length })), fetchedAt: r.fetchedAt, stale: r.stale }, { cdn: 600, swr: 3600 });
  } catch (e) { return Response.json({ error: e.busy ? "Data provider is busy, try again in a few seconds." : "Club data unavailable right now." }, { status: 503, headers: { "Retry-After": "10" } }); }
}
