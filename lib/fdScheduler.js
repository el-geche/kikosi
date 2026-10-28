// Runtime side of the football-data.org scheduler (see lib/fdPlan.js for the rules).
// Every upstream call goes through fdCall(), which first wins a slot from the Postgres function fd_acquire()
// (advisory lock + sliding 60 s window + per-job lease), so concurrent requests on any number of function instances
// never exceed the budget and only one of them fetches; everybody else reads the cache.
// Feeds are cached in three layers: per-instance memory (2 s) -> Vercel Runtime Cache (regional) -> Neon fd_cache.
import { db } from "./db.js";
import { BUDGET, CODES, plan, dueJobs, leagueMode } from "./fdPlan.js";

export const SCOPE = "fd";
const BASE = "https://api.football-data.org";
const SEASON = 2026;
const g = globalThis;
const mem = (g.__kikosiFdMem ??= new Map());
export const counters = (g.__kikosiFdCounters ??= { calls: 0, ok: 0, rateLimited: 0, busy: 0, ticks: 0 });

// ---- cache layers -------------------------------------------------------------------------------
let rc;
async function runtimeCache() {
  if (rc !== undefined) return rc;
  try { if (process.env.VERCEL) { const { getCache } = await import("@vercel/functions"); rc = getCache({ namespace: "kikosi-fd" }); } else rc = null; }
  catch { rc = null; }
  return rc;
}
export async function cacheGet(key) {
  const m = mem.get(key); if (m && Date.now() - m.at < 2000) return m.v;
  const c = await runtimeCache();
  if (c) { try { const v = await c.get(key); if (v) { mem.set(key, { v, at: Date.now() }); return v; } } catch {} }
  const r = await db()`select body, fetched_at from fd_cache where key = ${key}`;
  const v = r[0] ? { body: r[0].body, fetchedAt: new Date(r[0].fetched_at).getTime() } : null;
  if (v) { mem.set(key, { v, at: Date.now() }); if (c) c.set(key, v, { ttl: 3600, tags: ["fd"] }).catch(() => {}); }
  return v;
}
export async function cachePut(key, body, fetchedAt = Date.now()) {
  const v = { body, fetchedAt };
  mem.set(key, { v, at: Date.now() });
  await db()`insert into fd_cache (key, body, fetched_at) values (${key}, ${JSON.stringify(body)}::jsonb, ${new Date(fetchedAt).toISOString()})
    on conflict (key) do update set body = excluded.body, fetched_at = excluded.fetched_at`;
  const c = await runtimeCache(); if (c) await c.set(key, v, { ttl: 3600, tags: ["fd"] }).catch(() => {});
  return v;
}

// ---- budgeted upstream call ---------------------------------------------------------------------
/** Tries to win a slot for `job`. Returns "ok" or the reason it was refused (budget, backoff, remote, leased, not_due). */
export async function acquire(job, notBefore = null, leaseS = 25) {
  const r = await db()`select fd_acquire(${SCOPE}, ${job}, ${notBefore ? new Date(notBefore).toISOString() : null}::timestamptz, ${BUDGET}, ${leaseS}) as r`;
  return r[0].r;
}
async function report(job, status, headers) {
  const rem = headers?.get("x-requests-available-minute"), reset = headers?.get("x-requestcounter-reset");
  await db()`select fd_report(${SCOPE}, ${job}, ${status}, ${rem == null ? null : Number(rem)}::int, ${reset == null ? null : Number(reset)}::int)`;
}
/** Budgeted GET. Throws { busy: reason } when no slot is free (callers then serve cached data). */
export async function fdCall(job, path, { notBefore = null } = {}) {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not set");
  const got = await acquire(job, notBefore);
  if (got !== "ok") { counters.busy++; throw Object.assign(new Error(`football-data busy: ${got}`), { busy: got }); }
  counters.calls++;
  let r;
  try { r = await fetch(BASE + path, { headers: { "X-Auth-Token": key }, cache: "no-store" }); }
  catch (e) { await report(job, 599, null); throw e; }
  await report(job, r.status, r.headers);
  if (r.status === 429) { counters.rateLimited++; throw Object.assign(new Error("football-data 429 (backing off)"), { status: 429 }); }
  if (!r.ok) throw Object.assign(new Error(`football-data ${path}: ${r.status}`), { status: r.status });
  counters.ok++;
  return r.json();
}

// ---- jobs ---------------------------------------------------------------------------------------
async function modes() {
  const rows = await db()`select competition,
      count(*) filter (where status in ('IN_PLAY', 'PAUSED', 'LIVE') or (kickoff_utc <= now() and kickoff_utc > now() - interval '150 minutes'
        and status in ('SCHEDULED', 'TIMED')))::int as live,
      count(*) filter (where kickoff_utc > now() and kickoff_utc <= now() + interval '2 hours')::int as soon,
      count(*) filter (where kickoff_utc between now() - interval '10 minutes' and now() + interval '10 minutes'
        and status in ('SCHEDULED', 'TIMED'))::int as starting
    from matches where kickoff_utc > now() - interval '1 day' and kickoff_utc < now() + interval '1 day' group by competition`;
  const m = Object.fromEntries(CODES.map((c) => [c, "idle"])); let starting = false;
  for (const r of rows) { if (m[r.competition]) m[r.competition] = leagueMode(r); if (r.starting > 0) starting = true; }
  return { modes: m, starting };
}
export async function currentPlan() { const { modes: m, starting } = await modes(); return { modes: m, starting, ...plan(m, { starting }) }; }

async function runLeague(code, notBefore) {
  const { mapFdMatch } = await import("./data.js");
  const prev = await cacheGet(`feed:${code}`);
  const j = await fdCall(`league:${code}`, `/v4/competitions/${code}/matches?season=${SEASON}`, { notBefore });
  const names = {};
  for (const m of j.matches || []) for (const t of [m.homeTeam, m.awayTeam]) if (t?.name && t.shortName) names[t.name] = t.shortName;
  const cur = (j.matches || []).filter((m) => m.homeTeam?.name && m.awayTeam?.name).map(mapFdMatch);
  await cachePut(`feed:${code}`, { cur, names });
  await afterFetch(code, cur, prev?.body?.cur || []);
  return cur.length;
}
async function runLive(notBefore) {
  const prev = await cacheGet("live:all");
  const j = await fdCall("live", `/v4/matches?status=IN_PLAY,PAUSED&competitions=${CODES.join(",")}`, { notBefore });
  const matches = (j.matches || []).map((m) => ({ fdId: m.id, competition: m.competition?.code, status: m.status, ko: Date.parse(m.utcDate),
    home: m.homeTeam?.name, away: m.awayTeam?.name, hs: m.homeTeam?.shortName, as: m.awayTeam?.shortName,
    liveH: m.score?.fullTime?.home ?? 0, liveA: m.score?.fullTime?.away ?? 0 }));
  await cachePut("live:all", { matches });
  // Matches that dropped out of the live list have finished (or stopped): make their league due for a full refresh now.
  const gone = (prev?.body?.matches || []).filter((p) => !matches.some((m) => m.fdId === p.fdId));
  for (const c of new Set(gone.map((x) => x.competition))) await db()`update fd_jobs set last_try = null where key = ${`${SCOPE}:league:${c}`}`;
  await publishLiveChanges(prev?.body?.matches || [], matches);
  if (matches.length) { const g2 = await import("./gameStore.js"); await g2.updateLiveStatus(matches); }
  return matches.length;
}
async function afterFetch(code, cur, prevCur) {
  try { const g2 = await import("./gameStore.js"); await g2.syncMatches(code, SEASON, cur); await g2.settleIfDue(30e3); }
  catch (e) { console.error("sync failed:", e.message); }
  const live = (l) => l.filter((m) => m.liveH != null || ["IN_PLAY", "PAUSED"].includes(m.status))
    .map((m) => ({ fdId: m.fdId, competition: code, status: m.status, liveH: m.liveH, liveA: m.liveA, hs: m.hs, as: m.as }));
  const done = (l) => new Map(l.filter((m) => m.hg != null).map((m) => [m.fdId, `${m.hg}-${m.ag}`]));
  await publishLiveChanges(live(prevCur), live(cur));
  const before = done(prevCur), fin = cur.filter((m) => m.hg != null && before.get(m.fdId) !== `${m.hg}-${m.ag}`);
  if (prevCur.length && fin.length) await publishSafe("final", { competition: code, matches: fin.map((m) => ({ fdId: m.fdId, hg: m.hg, ag: m.ag })) });
}
async function publishLiveChanges(prev, next) {
  const key = (m) => `${m.status}:${m.liveH}-${m.liveA}`, before = new Map(prev.map((m) => [m.fdId, key(m)]));
  const changed = next.filter((m) => before.get(m.fdId) !== key(m));
  if (changed.length) await publishSafe("live", { matches: changed.map(({ fdId, competition, status, liveH, liveA }) => ({ fdId, competition, status, liveH, liveA })) });
}
async function publishSafe(kind, payload) { try { const { publish } = await import("./events.js"); await publish(kind, payload); } catch (e) { console.error("publish failed:", e.message); } }

let lastTick = 0, ticking = null;
/**
 * Runs at most ONE due job (highest priority first). Called opportunistically by page renders (via waitUntil), SSE
 * streams and polling endpoints; cheap when nothing is due. Returns what happened, for logs/tests.
 */
export function tick({ minGapMs = 1500 } = {}) {
  if (!process.env.DATABASE_URL || !process.env.FOOTBALL_DATA_API_KEY) return Promise.resolve({ skipped: "not configured" });
  if (ticking) return ticking;
  if (Date.now() - lastTick < minGapMs) return Promise.resolve({ skipped: "throttled" });
  lastTick = Date.now(); counters.ticks++;
  ticking = (async () => {
    const p = await currentPlan();
    const rows = await db()`select key, last_try from fd_jobs where key like ${SCOPE + ":%"}`;
    const last = Object.fromEntries(rows.map((r) => [r.key.slice(SCOPE.length + 1), r.last_try ? new Date(r.last_try).getTime() : null]));
    const due = dueJobs(p, last);
    for (const j of due.slice(0, 2)) {
      const notBefore = Date.now() - j.interval * 800;
      try { const n = j.kind === "live" ? await runLive(notBefore) : await runLeague(j.code, notBefore); return { ran: j.key, n, perMinute: p.perMinute }; }
      catch (e) { if (e.busy === "leased" || e.busy === "not_due") continue; return { ran: null, reason: e.busy || e.message }; }
    }
    return { ran: null, due: due.length };
  })().finally(() => { ticking = null; });
  return ticking;
}

/** League feed for pages: cached copy (any age) + background refresh; blocks only when nothing is cached yet. */
export async function leagueFeed(code) {
  let hit = await cacheGet(`feed:${code}`);
  if (!hit) {
    for (let i = 0; i < 3 && !hit; i++) {
      try { await runLeague(code, null); } catch (e) { if (e.busy === "budget" || e.busy === "remote") await new Promise((r) => setTimeout(r, 4000)); else if (e.busy !== "leased") break; else await new Promise((r) => setTimeout(r, 1500)); }
      hit = await cacheGet(`feed:${code}`);
    }
  }
  return hit;
}
export async function liveFeed() { return cacheGet("live:all"); }
export async function budgetStatus() {
  const b = await db()`select (select count(*)::int from fd_calls where scope = ${SCOPE} and at > clock_timestamp() - interval '60 seconds') as used,
    backoff_until, backoff_n, remote_remaining, remote_reset_at, last_status, rate_limited from fd_budget where scope = ${SCOPE}`;
  return b[0] || null;
}
