// football-data.org free-tier scheduler: pure planning (unit-tested). The runtime side is lib/fdScheduler.js.
// One central budget for the whole app: at most BUDGET calls in any 60 s window (free tier allows 10).
export const BUDGET = 9;
export const HEADROOM = 0.5;       // calls/min kept free for on-demand clubs/scorers lookups
export const STAGGER_S = 12;       // 5 leagues spread over a minute: :00, :12, :24, :36, :48
export const CODES = ["PL", "PD", "BL1", "SA", "FL1"];
export const INTERVAL_S = { live: 60, upcoming: 300, idle: 900 }; // base refresh per league mode
export const LIVE_LEAGUE_MIN_S = 15;
export const PRIORITY = { live: 0, liveLeague: 1, upcoming: 2, idle: 3, onDemand: 4 };

/**
 * League mode from its fixtures: "live" if a match is in play (or should be: kicked off < 2 h 30 ago and not final),
 * "upcoming" if a kickoff is within the next 2 hours, else "idle". `starting` = a kickoff within ±10 min.
 */
export function leagueMode({ live = 0, soon = 0 } = {}) { return live > 0 ? "live" : soon > 0 ? "upcoming" : "idle"; }

/**
 * Builds the schedule for the current modes { PL: "live" | "upcoming" | "idle", ... }.
 *  - one LIVE-ONLY call (/v4/matches?status=IN_PLAY,PAUSED&competitions=all 5) every 20 s when 2+ leagues are live,
 *    every 60 s when 1 league is live or a kickoff is due (safety net for score/kickoff changes elsewhere);
 *  - non-live leagues at 5 min (upcoming) / 15 min (idle);
 *  - live leagues share the spare budget, each refreshed every 15–60 s.
 * Returns { jobs: [{ key, kind, code?, interval, offset, priority }], perMinute }.
 */
export function plan(modes, { starting = false, budget = BUDGET } = {}) {
  const live = CODES.filter((c) => modes[c] === "live");
  const jobs = [];
  const liveCallS = live.length >= 2 ? 20 : live.length === 1 || starting ? 60 : null;
  if (liveCallS) jobs.push({ key: "live", kind: "live", interval: liveCallS, offset: 6, priority: PRIORITY.live });
  let base = liveCallS ? 60 / liveCallS : 0;
  CODES.forEach((c, i) => {
    const m = modes[c] || "idle";
    if (m === "live") return;
    const interval = INTERVAL_S[m];
    base += 60 / interval;
    jobs.push({ key: `league:${c}`, kind: "league", code: c, mode: m, interval, offset: i * STAGGER_S, priority: PRIORITY[m] });
  });
  if (live.length) {
    const spare = Math.max(live.length, budget - HEADROOM - base); // never below 1/min per live league
    const each = Math.min(60 / LIVE_LEAGUE_MIN_S, spare / live.length);
    const interval = Math.min(INTERVAL_S.live, Math.max(LIVE_LEAGUE_MIN_S, Math.ceil(60 / each)));
    live.forEach((c) => jobs.push({ key: `league:${c}`, kind: "league", code: c, mode: "live", interval,
      offset: CODES.indexOf(c) * STAGGER_S, priority: PRIORITY.liveLeague }));
  }
  const perMinute = jobs.reduce((s, j) => s + 60 / j.interval, 0);
  return { jobs: jobs.sort((a, b) => a.priority - b.priority || a.offset - b.offset), perMinute };
}

/**
 * Next due time (ms) on a staggered grid: slots at k·interval + offset seconds. A job that ran at `lastMs` is due at the
 * first slot at least 80% of an interval later (so a late run doesn't push every later run back). Never run -> due now.
 */
export function nextDue(lastMs, intervalS, offsetS, now = Date.now()) {
  if (lastMs == null) return now;
  const earliest = lastMs + intervalS * 800, I = intervalS * 1000, O = (offsetS % intervalS) * 1000;
  return Math.ceil((earliest - O) / I) * I + O;
}
/** Jobs due now, in priority order, most overdue first within a priority. lastTry: { [key]: ms | null }. */
export function dueJobs(p, lastTry, now = Date.now()) {
  return p.jobs.map((j) => ({ ...j, due: nextDue(lastTry[j.key] ?? null, j.interval, j.offset, now) }))
    .filter((j) => j.due <= now)
    .sort((a, b) => a.priority - b.priority || a.due - b.due);
}

/** Back-off after a 429: at least the server's reset hint, else 15 s doubling to 4 min. */
export const backoffSeconds = (n, resetS) => Math.max(Number(resetS) || 0, Math.min(240, 15 * 2 ** Math.min(n, 4)));

/**
 * In-memory equivalent of the Postgres fd_acquire() (same rules), used by tests and as a fallback without a database.
 * Async with an internal mutex so concurrent callers are serialised exactly like the advisory lock.
 */
export class MemoryBudget {
  constructor({ budget = BUDGET, now = () => Date.now() } = {}) { this.budget = budget; this.now = now; this.calls = []; this.jobs = new Map();
    this.backoffUntil = 0; this.backoffN = 0; this.remote = null; this.resetAt = 0; this.lock = Promise.resolve(); }
  acquire(job, notBefore = null, leaseS = 25) {
    const run = async () => {
      await new Promise((r) => setTimeout(r, Math.random() * 3)); // simulate I/O inside the critical section
      const t = this.now();
      if (this.backoffUntil > t) return "backoff";
      if (this.remote != null && this.remote <= 1 && this.resetAt > t) return "remote";
      const j = this.jobs.get(job) || { lastTry: null, lease: 0 };
      if (j.lease > t) return "leased";
      if (j.lastTry != null && notBefore != null && j.lastTry > notBefore) return "not_due";
      this.calls = this.calls.filter((c) => c > t - 60e3);
      if (this.calls.length >= this.budget) return "budget";
      this.calls.push(t); this.jobs.set(job, { lastTry: t, lease: t + leaseS * 1000 });
      if (this.remote != null) this.remote--;
      return "ok";
    };
    const p = this.lock.then(run, run); this.lock = p.catch(() => {}); return p;
  }
  report(job, status, remaining = null, resetS = null) {
    const t = this.now();
    if (remaining != null) this.remote = remaining;
    if (resetS != null) this.resetAt = t + resetS * 1000;
    if (status === 429) { this.backoffUntil = t + backoffSeconds(this.backoffN, resetS) * 1000; this.backoffN++; } else this.backoffN = 0;
    const j = this.jobs.get(job); if (j) j.lease = 0;
  }
  inWindow() { const t = this.now(); return this.calls.filter((c) => c > t - 60e3).length; }
}
