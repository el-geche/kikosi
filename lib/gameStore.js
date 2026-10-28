// Database side of the prediction game: fixture mirror, predictions, settlement, stats, badges, leaderboards.
// Server-only, but free of Next.js imports so scripts can use it too.
import { db } from "./db.js";
import { cleanName } from "./data.js";
import { scorePrediction, settleAction, computeStreaks, earnedBadges, awardBadges, eatWeek, rankRows, MIN_SETTLED_FOR_BOARD } from "./game.js";

// ---- Item 4: mirror fixtures --------------------------------------------------------------------
export async function syncMatches(code, season, fixtures) {
  const lv = fixtures.filter((m) => Number.isInteger(m.fdId) && (m.liveH != null || ["IN_PLAY", "PAUSED"].includes(m.status)));
  const rows = fixtures.filter((m) => Number.isInteger(m.fdId) && Number.isFinite(m.ko));
  if (!rows.length) return 0;
  const col = (f) => rows.map(f);
  await db()`insert into matches (id, competition, season, matchday, home, away, home_short, away_short, kickoff_utc, status, ft_home, ft_away, updated_at)
    select id, ${code}, ${season}, md, home, away, hs, aws, ko, st, fh, fa, now()
    from unnest(${col((m) => m.fdId)}::int[], ${col((m) => m.matchday ?? null)}::int[], ${col((m) => m.home)}::text[], ${col((m) => m.away)}::text[],
                ${col((m) => m.hs || cleanName(m.home))}::text[], ${col((m) => m.as || cleanName(m.away))}::text[],
                ${col((m) => new Date(m.ko).toISOString())}::timestamptz[], ${col((m) => m.status)}::text[],
                ${col((m) => m.hg ?? null)}::smallint[], ${col((m) => m.ag ?? null)}::smallint[])
      as t(id, md, home, away, hs, aws, ko, st, fh, fa)
    on conflict (id) do update set matchday = excluded.matchday, home = excluded.home, away = excluded.away,
      home_short = excluded.home_short, away_short = excluded.away_short, kickoff_utc = excluded.kickoff_utc,
      status = excluded.status, ft_home = excluded.ft_home, ft_away = excluded.ft_away, updated_at = now()
    where (matches.status, matches.kickoff_utc, matches.ft_home, matches.ft_away)
      is distinct from (excluded.status, excluded.kickoff_utc, excluded.ft_home, excluded.ft_away)`;
  if (lv.length) await updateLiveStatus(lv);
  return rows.length;
}

/** Status/score updates from the live-only call (scores stay out of ft_* until the match is FINISHED). */
export async function updateLiveStatus(live) {
  if (!live.length) return;
  await db()`update matches m set status = v.st, live_home = v.lh, live_away = v.la, updated_at = now()
    from unnest(${live.map((x) => x.fdId)}::int[], ${live.map((x) => x.status)}::text[], ${live.map((x) => x.liveH ?? null)}::smallint[],
      ${live.map((x) => x.liveA ?? null)}::smallint[]) as v(id, st, lh, la)
    where m.id = v.id and (m.status, m.live_home, m.live_away) is distinct from (v.st, v.lh, v.la)`;
}

// ---- Item 5: predictions ------------------------------------------------------------------------
/** Upsert guarded by the kickoff lock in the same statement (database clock). Returns the row, or null if locked. */
export async function savePrediction(memberId, matchId, h, a) {
  const r = await db()`insert into predictions (member_id, match_id, home_goals, away_goals)
    select ${memberId}, id, ${h}, ${a} from matches
    where id = ${matchId} and status in ('SCHEDULED', 'TIMED') and kickoff_utc > now()
    on conflict (member_id, match_id) do update set home_goals = excluded.home_goals, away_goals = excluded.away_goals, updated_at = now()
      where predictions.settled_at is null
    returning match_id, home_goals, away_goals, updated_at`;
  return r[0] || null;
}
export async function getMatch(id) {
  const r = await db()`select id, status, kickoff_utc from matches where id = ${id}`; return r[0] || null;
}
export async function myPredictions(memberId, ids) {
  if (!ids.length) return [];
  return db()`select p.match_id, p.home_goals, p.away_goals, p.points, p.voided, p.settled_at, m.status, m.kickoff_utc
    from predictions p join matches m on m.id = p.match_id where p.member_id = ${memberId} and p.match_id = any(${ids}::int[])`;
}
export async function recentPredictions(memberId, limit = 10) {
  return db()`select p.match_id, p.home_goals, p.away_goals, p.points, p.voided, m.home_short, m.away_short, m.competition,
      m.kickoff_utc, m.status, m.ft_home, m.ft_away
    from predictions p join matches m on m.id = p.match_id where p.member_id = ${memberId}
    order by m.kickoff_utc desc limit ${limit}`;
}

// ---- Item 6: settlement -------------------------------------------------------------------------
let lastSettle = 0, running = null;
/** Lazy settlement, at most once a minute per instance. */
export function settleIfDue(minGapMs = 60e3) {
  if (running) return running;
  if (Date.now() - lastSettle < minGapMs) return Promise.resolve(null);
  lastSettle = Date.now();
  running = settle().catch((e) => { console.error("settle failed:", e.message); return null; }).finally(() => { running = null; });
  return running;
}

/**
 * Idempotent: scores matches whose final score differs from what was last settled (so score corrections re-score),
 * voids cancelled / long-postponed matches, and re-opens voided matches that were rescheduled.
 */
export async function settle(now = Date.now()) {
  const sql = db();
  const cand = await sql`select id, status, kickoff_utc, ft_home, ft_away, settled_score from matches
    where (status in ('FINISHED', 'AWARDED') and ft_home is not null and settled_score is distinct from ft_home || '-' || ft_away)
       or (status in ('CANCELLED', 'POSTPONED', 'SUSPENDED') and settled_score is distinct from 'void')
       or (settled_score = 'void' and status not in ('CANCELLED', 'POSTPONED', 'SUSPENDED'))
    order by kickoff_utc limit 300`;
  const touched = new Set(); let scored = 0, voided = 0, reopened = 0;
  for (const m of cand) {
    const act = settleAction({ ...m, kickoff_utc: new Date(m.kickoff_utc).toISOString() }, now);
    const preds = await sql`select member_id, home_goals, away_goals from predictions where match_id = ${m.id}`;
    preds.forEach((p) => touched.add(p.member_id));
    if (act === "score") {
      const ids = preds.map((p) => p.member_id), pts = preds.map((p) => scorePrediction(p.home_goals, p.away_goals, m.ft_home, m.ft_away));
      await sql.transaction([
        sql`update predictions p set points = v.pts, voided = false, settled_at = now()
          from unnest(${ids}::uuid[], ${pts}::smallint[]) as v(mid, pts) where p.match_id = ${m.id} and p.member_id = v.mid`,
        sql`update matches set settled_score = ${`${m.ft_home}-${m.ft_away}`} where id = ${m.id}`,
      ]);
      scored++;
    } else if (act === "void") {
      await sql.transaction([
        sql`update predictions set points = null, voided = true, settled_at = now() where match_id = ${m.id}`,
        sql`update matches set settled_score = 'void' where id = ${m.id}`,
      ]);
      voided++;
    } else if (m.settled_score === "void") {
      await sql.transaction([
        sql`update predictions set voided = false, settled_at = null, points = null where match_id = ${m.id}`,
        sql`update matches set settled_score = null where id = ${m.id}`,
      ]);
      reopened++;
    }
  }
  for (const id of touched) await refreshMember(id);
  const weekly = await decideWeeklyWinners(now);
  let recaps = 0;
  try { const { recapsDue } = await import("./socialStore.js"); recaps = await recapsDue(); } catch (e) { console.error("recap failed:", e.message); }
  if (scored || voided) { try { const { publish } = await import("./events.js"); await publish("settled", { scored, voided }); } catch {} }
  return { recaps, candidates: cand.length, scored, voided, reopened, members: touched.size, weekly };
}

/** Recomputes a member's totals and streaks, then awards stat badges (idempotent). */
export async function refreshMember(memberId) {
  const sql = db();
  const preds = await sql`select p.match_id, p.points, p.voided, m.kickoff_utc from predictions p join matches m on m.id = p.match_id
    where p.member_id = ${memberId}`;
  const settled = preds.filter((p) => p.points != null && !p.voided);
  const s = {
    predictions: preds.length, settled: settled.length,
    points: settled.reduce((t, p) => t + p.points, 0),
    exact: settled.filter((p) => p.points === 3).length, outcomes: settled.filter((p) => p.points >= 1).length,
  };
  const st = computeStreaks(preds.map((p) => ({ points: p.points, voided: p.voided, kickoff: new Date(p.kickoff_utc).toISOString(), matchId: p.match_id })));
  await sql`insert into member_stats (member_id, predictions, settled, points, exact, outcomes, current_streak, best_streak, updated_at)
    values (${memberId}, ${s.predictions}, ${s.settled}, ${s.points}, ${s.exact}, ${s.outcomes}, ${st.current}, ${st.best}, now())
    on conflict (member_id) do update set predictions = excluded.predictions, settled = excluded.settled, points = excluded.points,
      exact = excluded.exact, outcomes = excluded.outcomes, current_streak = excluded.current_streak, best_streak = excluded.best_streak, updated_at = now()`;
  await awardBadges(pgBadgeStore, memberId, earnedBadges({ ...s, bestStreak: st.best }));
  return { ...s, currentStreak: st.current, bestStreak: st.best };
}
export const pgBadgeStore = {
  async insertBadge(memberId, badgeId, context = null) {
    const r = await db()`insert into member_badges (member_id, badge_id, context) values (${memberId}, ${badgeId}, ${context})
      on conflict do nothing returning badge_id`;
    return r.length > 0;
  },
};

/** Judges the last 4 closed EAT weeks once each; awards weekly_winner to the top eligible member with points. */
async function decideWeeklyWinners(now) {
  const sql = db(); const out = [];
  for (let k = 1; k <= 4; k++) {
    const w = eatWeek(now, k * -1 + 0);
    const start = new Date(w.start).toISOString(), end = new Date(w.end).toISOString();
    const done = await sql`select 1 from weekly_results where week_start = ${start}`;
    if (done.length) continue;
    // Wait until every prediction on that week's matches is settled or voided.
    const open = await sql`select count(*)::int as n from predictions p join matches m on m.id = p.match_id
      where m.kickoff_utc >= ${start} and m.kickoff_utc < ${end} and p.settled_at is null`;
    if (open[0].n > 0) continue;
    const board = await leaderboard({ start: w.start, end: w.end });
    const top = board.rows.find((r) => r.rank === 1 && r.points > 0);
    await sql`insert into weekly_results (week_start, winner_id, points) values (${start}, ${top?.memberId ?? null}, ${top?.points ?? null})
      on conflict do nothing`;
    if (top) { await pgBadgeStore.insertBadge(top.memberId, "weekly_winner", `week of ${start.slice(0, 10)}`); out.push(top.handle); }
  }
  return out;
}

// ---- (A) Leaderboards ---------------------------------------------------------------------------
/** { rows: [{ rank, handle, points, exact, outcomes, reachedAt, streak, allTimePoints }], ... } within [start, end) or all-time. */
export async function leaderboard({ start = null, end = null, limit = 100 } = {}) {
  const s = start == null ? null : new Date(start).toISOString(), e = end == null ? null : new Date(end).toISOString();
  const rows = await db()`select mb.id as member_id, mb.handle::text as handle,
      coalesce(sum(p.points), 0)::int as points,
      count(*) filter (where p.points = 3)::int as exact,
      count(*) filter (where p.points >= 1)::int as outcomes,
      max(m.kickoff_utc) filter (where p.points > 0) as reached_at,
      ms.current_streak, ms.points as all_time_points
    from predictions p
    join members mb on mb.id = p.member_id and not mb.banned
    join matches m on m.id = p.match_id
    join member_stats ms on ms.member_id = mb.id and ms.settled >= ${MIN_SETTLED_FOR_BOARD}
    where p.points is not null and not p.voided
      and (${s}::timestamptz is null or m.kickoff_utc >= ${s}::timestamptz)
      and (${e}::timestamptz is null or m.kickoff_utc < ${e}::timestamptz)
    group by mb.id, mb.handle, ms.current_streak, ms.points`;
  const ranked = rankRows(rows.map((r) => ({ memberId: r.member_id, handle: r.handle, points: r.points, exact: r.exact, outcomes: r.outcomes,
    reachedAt: r.reached_at ? new Date(r.reached_at).toISOString() : null, streak: r.current_streak, allTimePoints: r.all_time_points })));
  return { rows: ranked.slice(0, limit), total: ranked.length };
}

// ---- Profile -------------------------------------------------------------------------------------
export async function profile(handle) {
  const sql = db();
  const m = await sql`select m.id, m.handle::text as handle, m.created_at, m.fav_team_id, coalesce(s.points, 0)::int as points,
      coalesce(s.predictions, 0)::int as predictions, coalesce(s.settled, 0)::int as settled, coalesce(s.exact, 0)::int as exact,
      coalesce(s.outcomes, 0)::int as outcomes, coalesce(s.current_streak, 0)::int as current_streak, coalesce(s.best_streak, 0)::int as best_streak
    from members m left join member_stats s on s.member_id = m.id where m.handle = ${handle} and not m.banned`;
  if (!m[0]) return null;
  const badges = await sql`select b.id, b.name, b.description, b.icon, mb.awarded_at from badges b
    left join member_badges mb on mb.badge_id = b.id and mb.member_id = ${m[0].id} order by b.sort`;
  return { ...m[0], badges };
}
