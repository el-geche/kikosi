// Live board: matches in play (from the Neon fixture mirror, updated by the scheduler's shared live-only call),
// in-play 1X2, "points if it ends now" and the provisional leaderboard. Picks are only read for matches that have
// kicked off, so nothing here can leak a pick before kickoff.
import { db } from "./db.js";
import { LEAGUES } from "./data.js";
import { getOne } from "./all.js";
import { inPlayProbs, playedMinutes, livePoints, provisionalMoves } from "./live.js";
import { rankFor } from "./ranks.js";
import { MIN_SETTLED_FOR_BOARD } from "./game.js";

export const DEMO_XG = { lh: 1.45, la: 1.15 }; // simulated fixtures only (no real model exists for them)
export const LIVE_NOTE = "Provisional: scores come from football-data.org's free tier, which can lag the real match by a minute or more. The minute is estimated from the kick-off time. Points are only final after full time.";

export async function liveBoard(memberId, { demo = false, now = Date.now() } = {}) {
  const sql = db();
  const rows = await sql`select id, competition, home_short, away_short, kickoff_utc, status, live_home, live_away from matches
    where (status in ('IN_PLAY', 'PAUSED') or (live_home is not null and ft_home is null and status not in ('FINISHED', 'AWARDED', 'POSTPONED', 'CANCELLED', 'SUSPENDED')))
      and kickoff_utc <= now() and kickoff_utc > now() - interval '4 hours'
      and (${demo} or competition <> 'TEST')
    order by kickoff_utc, id limit 30`;
  // Pre-match expected goals from the league model, where the fixture is a real one.
  const xg = {};
  for (const code of new Set(rows.map((r) => r.competition).filter((c) => c !== "TEST"))) {
    const l = LEAGUES.find((x) => x.fd === code); if (!l) continue;
    try { for (const m of (await getOne(l.slug)).live || []) if (m.fdId && m.lh) xg[m.fdId] = { lh: m.lh, la: m.la }; } catch {}
  }
  const matches = rows.map((r) => {
    const ko = new Date(r.kickoff_utc).getTime(), simulated = r.competition === "TEST", hg = r.live_home ?? 0, ag = r.live_away ?? 0;
    const minute = playedMinutes(ko, now, r.status), x = simulated ? DEMO_XG : xg[r.id];
    return { fdId: r.id, competition: simulated ? "TEST" : LEAGUES.find((l) => l.fd === r.competition)?.name || r.competition, home: r.home_short, away: r.away_short,
      ko, status: r.status, liveH: hg, liveA: ag, minute, simulated, inPlay: x ? inPlayProbs(x.lh, x.la, hg, ag, minute) : null, preMatch: x || null };
  });
  const ids = matches.map((m) => m.fdId), score = new Map(matches.map((m) => [m.fdId, [m.liveH, m.liveA]]));
  let board = [], mine = [], meHandle = null;
  if (ids.length) {
    const picks = await sql`select p.member_id, mb.handle::text as handle, p.match_id, p.home_goals, p.away_goals from predictions p
      join members mb on mb.id = p.member_id and not mb.banned join matches m on m.id = p.match_id
      where p.match_id = any(${ids}::int[]) and m.kickoff_utc <= now() and p.points is null`;
    const liveBy = {};
    for (const p of picks) { const [h, a] = score.get(p.match_id); const pts = livePoints(p, h, a); liveBy[p.handle] = (liveBy[p.handle] || 0) + pts;
      if (memberId && p.member_id === memberId) { meHandle = p.handle; mine.push({ fdId: p.match_id, pick: `${p.home_goals}-${p.away_goals}`, livePoints: pts }); } }
    const stats = await sql`select mb.handle::text as handle, coalesce(s.points, 0)::int as points from members mb left join member_stats s on s.member_id = mb.id
      where not mb.banned and (coalesce(s.settled, 0) >= ${MIN_SETTLED_FOR_BOARD} or mb.handle = any(${Object.keys(liveBy)}::text[]))`;
    board = provisionalMoves(stats.map((s) => ({ handle: s.handle, points: s.points, live: liveBy[s.handle] || 0 })))
      .slice(0, 50).map((r) => ({ ...r, tier: rankFor(r.points).tier.id }));
  }
  if (memberId && !meHandle) meHandle = (await sql`select handle::text as h from members where id = ${memberId}`)[0]?.h || null;
  return { matches, board, mine, me: meHandle, demo, note: LIVE_NOTE };
}
