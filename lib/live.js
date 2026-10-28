// Live and upcoming match maths, SSE serialisation and recap selection. Pure functions (unit-tested).
import { poisson } from "./model.js";
import { scorePrediction } from "./game.js";

// ---- In-play model ------------------------------------------------------------------------------
/**
 * Estimated minutes played from the kick-off time (the free tier has no match clock). Adds 15 min for half-time:
 * 0–45 first half, PAUSED = 45, then (elapsed − 15) capped at 90.
 */
export function playedMinutes(koMs, now, status) {
  if (status === "PAUSED") return 45;
  const el = Math.max(0, (now - koMs) / 60e3);
  if (el <= 45) return Math.floor(el);
  if (el <= 60) return 45; // likely half-time if the feed hasn't said PAUSED yet
  return Math.min(90, Math.floor(el - 15));
}
/**
 * Win/draw/loss probabilities conditioned on the current score: the remaining goals are Poisson with the pre-match
 * expected goals scaled by the share of the 90 minutes left (minimum 2% for stoppage time).
 */
export function inPlayProbs(lh, la, hg, ag, minute) {
  const left = Math.max(0.02, (90 - Math.min(90, Math.max(0, minute))) / 90);
  const rh = lh * left, ra = la * left;
  let H = 0, D = 0, A = 0, best = [hg, ag, 0];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = poisson(rh, i) * poisson(ra, j), fh = hg + i, fa = ag + j;
    if (fh > fa) H += p; else if (fh === fa) D += p; else A += p;
    if (p > best[2]) best = [fh, fa, p];
  }
  const s = H + D + A;
  return { H: H / s, D: D / s, A: A / s, score: `${best[0]}-${best[1]}`, xgLeftH: rh, xgLeftA: ra, minute, provisional: true };
}
/** "Live points if it ends now" for a pick against the current score. */
export const livePoints = (pick, hg, ag) => scorePrediction(pick.home_goals, pick.away_goals, hg, ag);

/** Provisional rank movement: rows { handle, points, live } -> rank now, provisional rank if all live games end now, move (+ = up). */
export function provisionalMoves(rows) {
  const withTotal = rows.map((r) => ({ ...r, total: r.points + (r.live || 0) }));
  const rank = (k) => new Map([...withTotal].sort((a, b) => b[k] - a[k] || String(a.handle).localeCompare(String(b.handle))).map((r, i) => [r.handle, i + 1]));
  const before = rank("points"), after = rank("total");
  return withTotal.map((r) => ({ ...r, rank: before.get(r.handle), provisionalRank: after.get(r.handle), move: before.get(r.handle) - after.get(r.handle) }))
    .sort((a, b) => a.provisionalRank - b.provisionalRank);
}

// ---- Countdown (lives in ./countdown.js so client components can import it without server code) ----
export { countdownParts } from "./countdown.js";

// ---- Member split (anonymous aggregate before kickoff) ---------------------------------------------
export const SPLIT_MIN = 3; // fewer picks than this are not broken down, so nobody's pick can be inferred
export function memberSplit(picks) {
  const n = picks.length;
  if (n < SPLIT_MIN) return { n, shown: false };
  let h = 0, d = 0, a = 0;
  for (const p of picks) { if (p.home_goals > p.away_goals) h++; else if (p.home_goals < p.away_goals) a++; else d++; }
  return { n, shown: true, home: h / n, draw: d / n, away: a / n };
}

// ---- Server-Sent Events --------------------------------------------------------------------------
/** One SSE frame. Data is JSON on a single line; id enables Last-Event-ID resume. */
export function sseFrame({ id, event, data, retry }) {
  let out = "";
  if (retry != null) out += `retry: ${Math.floor(retry)}\n`;
  if (id != null) out += `id: ${String(id).replace(/[\r\n]/g, "")}\n`;
  if (event) out += `event: ${String(event).replace(/[\r\n]/g, "")}\n`;
  out += `data: ${JSON.stringify(data ?? null)}\n\n`;
  return out;
}
export const sseComment = (text) => `: ${String(text).replace(/[\r\n]/g, " ")}\n\n`;
/** Parses a Last-Event-ID / ?after= cursor; anything invalid restarts from "now" (null). */
export function parseCursor(v) { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 ? n : null; }

// ---- Recap selection -----------------------------------------------------------------------------
/**
 * Picks recap pins for a closed week. Inputs (all already limited to the week):
 *  reactionsByTarget [{ handle, count }], comments [{ id, author, target, body, targetReactions }],
 *  exacts [{ handle, match, pick, sameExact }] (sameExact = how many members also hit that exact score),
 *  streaks [{ handle, streak }], before/after = all-time ranked rows [{ handle, rank }] at week start/end.
 */
export function selectRecap({ reactionsByTarget = [], comments = [], exacts = [], streaks = [], before = [], after = [] }, n = 3) {
  const top = (arr, key, tie = "handle") => [...arr].sort((a, b) => b[key] - a[key] || String(a[tie]).localeCompare(String(b[tie]))).slice(0, n);
  const reactions = top(reactionsByTarget.filter((r) => r.count > 0), "count").map((r) => ({ kind: "reaction", ref: r.handle, score: r.count, data: r }));
  const cm = [...comments].sort((a, b) => b.targetReactions - a.targetReactions || b.id - a.id).slice(0, n)
    .map((c) => ({ kind: "comment", ref: String(c.id), score: c.targetReactions, data: c }));
  const ex = [...exacts].sort((a, b) => a.sameExact - b.sameExact || (b.goals ?? 0) - (a.goals ?? 0) || String(a.handle).localeCompare(String(b.handle)))
    .slice(0, n).map((e) => ({ kind: "exact", ref: `${e.matchId}:${e.handle}`, score: 1 / (1 + e.sameExact), data: e }));
  const st = top(streaks.filter((s) => s.streak >= 2), "streak").map((s) => ({ kind: "streak", ref: s.handle, score: s.streak, data: s }));
  const b = new Map(before.map((r) => [r.handle, r.rank])), unranked = before.length + 1;
  const movers = after.map((r) => ({ handle: r.handle, from: b.get(r.handle) ?? null, to: r.rank, move: (b.get(r.handle) ?? unranked) - r.rank }))
    .filter((m) => m.move > 0);
  const mv = top(movers, "move").map((m) => ({ kind: "mover", ref: m.handle, score: m.move, data: m }));
  return [...reactions, ...cm, ...ex, ...st, ...mv];
}

// ---- SSE poll cadence ----------------------------------------------------------------------------
/** Cross-instance events-table poll delay: 1 s while there was activity in the last 30 s, 3 s within 2 min, else 5 s. */
export const pollDelay = (quietMs) => (quietMs < 30e3 ? 1000 : quietMs < 120e3 ? 3000 : 5000);

// ---- Recap week keys -----------------------------------------------------------------------------
const EAT_MS = 3 * 3600e3;
/** URL key for a recap week: the Monday (EAT) that starts it, YYYY-MM-DD. weekStartMs is the UTC instant of Mon 00:00 EAT. */
export const weekKey = (weekStartMs) => new Date(weekStartMs + EAT_MS).toISOString().slice(0, 10);
/** Inverse of weekKey; null unless the key is a real Monday. */
export function weekFromKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return null;
  const d = Date.parse(`${key}T00:00:00Z`); if (!Number.isFinite(d) || new Date(d).toISOString().slice(0, 10) !== key || new Date(d).getUTCDay() !== 1) return null;
  return d - EAT_MS;
}
