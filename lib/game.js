// Prediction game rules: kickoff lock, 3/2/1/0 scoring, streaks, badges, weeks and leaderboard ranking.
// Pure functions (no DB, no Next.js) so they can be unit-tested. Free-to-play: points have no money value.

export const OPEN_STATUSES = new Set(["SCHEDULED", "TIMED"]);
export const FINAL_STATUSES = new Set(["FINISHED", "AWARDED"]);
export const OFF_STATUSES = new Set(["POSTPONED", "SUSPENDED", "CANCELLED"]);
export const VOID_AFTER_MS = 14 * 864e5; // postponed/suspended this long past the original kickoff -> void
export const MIN_SETTLED_FOR_BOARD = 5;
export const MAX_GOALS = 20;

/** Predictions can be created or edited only before kickoff and while the match is scheduled. */
export function isPredictionOpen(match, now = Date.now()) {
  if (!match) return false;
  const ko = match.kickoffMs ?? Date.parse(match.kickoff_utc);
  return OPEN_STATUSES.has(match.status) && Number.isFinite(ko) && now < ko;
}
export function validScore(h, a) {
  return Number.isInteger(h) && Number.isInteger(a) && h >= 0 && a >= 0 && h <= MAX_GOALS && a <= MAX_GOALS;
}

const outcome = (h, a) => (h > a ? 1 : h < a ? -1 : 0);
/** Exact score 3; right outcome and right goal difference 2; right outcome 1; else 0. */
export function scorePrediction(ph, pa, fh, fa) {
  if (ph === fh && pa === fa) return 3;
  if (outcome(ph, pa) !== outcome(fh, fa)) return 0;
  return ph - pa === fh - fa ? 2 : 1;
}
/** What settlement should do with a match: "score", "void" or null (not yet). */
export function settleAction(m, now = Date.now()) {
  if (FINAL_STATUSES.has(m.status) && m.ft_home != null && m.ft_away != null) return "score";
  if (m.status === "CANCELLED") return "void";
  if ((m.status === "POSTPONED" || m.status === "SUSPENDED") && now - Date.parse(m.kickoff_utc) > VOID_AFTER_MS) return "void";
  return null;
}

/**
 * Streaks over settled predictions ordered by kickoff (then match id). Correct = points >= 1.
 * Unsettled (points null) and voided predictions are skipped. Returns { current, best }.
 */
export function computeStreaks(preds) {
  const list = preds.filter((p) => !p.voided && p.points != null)
    .sort((a, b) => (Date.parse(a.kickoff) - Date.parse(b.kickoff)) || (a.matchId - b.matchId));
  let current = 0, best = 0;
  for (const p of list) { current = p.points >= 1 ? current + 1 : 0; if (current > best) best = current; }
  return { current, best };
}

export const BADGES = [
  { id: "first_prediction", name: "First pick", icon: "⚽", description: "Made your first prediction", sort: 10 },
  { id: "first_exact", name: "Spot on", icon: "🎯", description: "First exact score", sort: 20 },
  { id: "streak_3", name: "Hat-trick", icon: "🔥", description: "3 correct outcomes in a row", sort: 30 },
  { id: "streak_5", name: "On fire", icon: "🔥", description: "5 correct outcomes in a row", sort: 40 },
  { id: "streak_10", name: "Unstoppable", icon: "☄️", description: "10 correct outcomes in a row", sort: 50 },
  { id: "exact_10", name: "Sharpshooter", icon: "🏹", description: "10 exact scores", sort: 60 },
  { id: "predictions_50", name: "Regular", icon: "📅", description: "50 predictions made", sort: 70 },
  { id: "weekly_winner", name: "Weekly winner", icon: "🏆", description: "Top of a weekly leaderboard", sort: 80 },
];
/** Stat-based badges earned (weekly_winner is awarded separately when a week closes). */
export function earnedBadges(s) {
  const out = [];
  if (s.predictions >= 1) out.push("first_prediction");
  if (s.exact >= 1) out.push("first_exact");
  if (s.bestStreak >= 3) out.push("streak_3");
  if (s.bestStreak >= 5) out.push("streak_5");
  if (s.bestStreak >= 10) out.push("streak_10");
  if (s.exact >= 10) out.push("exact_10");
  if (s.predictions >= 50) out.push("predictions_50");
  return out;
}
/** Idempotent: store.insertBadge must ignore duplicates (Postgres: ON CONFLICT DO NOTHING). Returns newly awarded ids. */
export async function awardBadges(store, memberId, ids) {
  const fresh = [];
  for (const id of ids) if (await store.insertBadge(memberId, id)) fresh.push(id);
  return fresh;
}

// ---- Weeks (Monday 00:00 to Sunday 23:59:59 in EAT, UTC+3, no DST) ------------------------------
const EAT = 3 * 3600e3, DAY = 864e5;
/** UTC ms bounds [start, end) of the EAT week containing `now`; offset -1 gives the previous week. */
export function eatWeek(now = Date.now(), offset = 0) {
  const local = now + EAT, dayStart = Math.floor(local / DAY) * DAY;
  const dow = (new Date(dayStart).getUTCDay() + 6) % 7; // Monday = 0
  const start = dayStart - dow * DAY - EAT + offset * 7 * DAY;
  return { start, end: start + 7 * DAY };
}

/**
 * Ranks leaderboard rows { handle, points, exact, outcomes, reachedAt } by points, then exact scores, then correct outcomes,
 * then whoever reached that total earliest (reachedAt = kickoff of their last scoring match). Full ties share a rank.
 */
export function rankRows(rows) {
  const t = (x) => (x.reachedAt ? Date.parse(x.reachedAt) : Infinity);
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.exact - a.exact || b.outcomes - a.outcomes || t(a) - t(b)
    || String(a.handle).localeCompare(String(b.handle)));
  let prev = null;
  return sorted.map((r, i) => {
    const same = prev && prev.points === r.points && prev.exact === r.exact && prev.outcomes === r.outcomes && t(prev) === t(r);
    const rank = same ? prev.rank : i + 1;
    prev = { ...r, rank };
    return prev;
  });
}
