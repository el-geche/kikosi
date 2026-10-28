import test from "node:test";
import assert from "node:assert/strict";
import { scorePrediction, isPredictionOpen, validScore, settleAction, computeStreaks, earnedBadges, awardBadges, eatWeek, rankRows } from "../lib/game.js";
import { rankFor, TIERS } from "../lib/ranks.js";

test("3/2/1/0 scoring", () => {
  assert.equal(scorePrediction(2, 1, 2, 1), 3); assert.equal(scorePrediction(2, 1, 3, 2), 2); assert.equal(scorePrediction(3, 1, 1, 0), 1);
  assert.equal(scorePrediction(1, 1, 2, 2), 2); assert.equal(scorePrediction(1, 0, 0, 1), 0); assert.equal(scorePrediction(0, 0, 1, 0), 0);
});
test("kickoff lock and score validation", () => {
  const m = { status: "TIMED", kickoffMs: 1000 };
  assert.equal(isPredictionOpen(m, 999), true); assert.equal(isPredictionOpen(m, 1000), false); assert.equal(isPredictionOpen({ ...m, status: "IN_PLAY" }, 0), false);
  assert.equal(validScore(0, 20), true); assert.equal(validScore(-1, 0), false); assert.equal(validScore(1.5, 0), false); assert.equal(validScore(21, 0), false);
});
test("settlement action", () => {
  assert.equal(settleAction({ status: "FINISHED", ft_home: 1, ft_away: 0 }), "score"); assert.equal(settleAction({ status: "FINISHED", ft_home: null }), null);
  assert.equal(settleAction({ status: "CANCELLED" }), "void"); assert.equal(settleAction({ status: "IN_PLAY" }), null);
  assert.equal(settleAction({ status: "POSTPONED", kickoff_utc: "2026-01-01T00:00:00Z" }, Date.parse("2026-01-10T00:00:00Z")), null);
  assert.equal(settleAction({ status: "POSTPONED", kickoff_utc: "2026-01-01T00:00:00Z" }, Date.parse("2026-01-20T00:00:00Z")), "void");
});
test("streaks skip voided/unsettled and use kickoff order", () => {
  const p = (d, pts, voided = false) => ({ kickoff: `2026-10-${d}T12:00:00Z`, matchId: d, points: pts, voided });
  assert.deepEqual(computeStreaks([p(10, 1), p(11, 3), p(12, 0), p(13, 2), p(14, null), p(15, 0, true), p(16, 1)]), { current: 2, best: 2 });
  assert.deepEqual(computeStreaks([p(3, 1), p(1, 1), p(2, 1)]), { current: 3, best: 3 });
});
test("badges are earned by thresholds and awarded idempotently", async () => {
  assert.deepEqual(earnedBadges({ predictions: 50, exact: 10, bestStreak: 10 }), ["first_prediction", "first_exact", "streak_3", "streak_5", "streak_10", "exact_10", "predictions_50"]);
  assert.deepEqual(earnedBadges({ predictions: 0, exact: 0, bestStreak: 0 }), []);
  const have = new Set(), store = { insertBadge: async (m, id) => (have.has(id) ? false : (have.add(id), true)) };
  assert.deepEqual(await awardBadges(store, 1, ["first_prediction"]), ["first_prediction"]); assert.deepEqual(await awardBadges(store, 1, ["first_prediction"]), []);
});
test("EAT weeks run Monday 00:00 to Sunday 23:59 Nairobi time", () => {
  const w = eatWeek(Date.parse("2026-10-28T09:00:00Z"));
  assert.equal(new Date(w.start).toISOString(), "2026-10-25T21:00:00.000Z"); assert.equal(w.end - w.start, 7 * 864e5);
  assert.equal(eatWeek(Date.parse("2026-10-25T20:59:59Z")).start, w.start - 7 * 864e5); // Sunday 23:59:59 EAT is last week
  assert.equal(eatWeek(Date.parse("2026-10-25T21:00:00Z")).start, w.start);
});
test("leaderboard tie-breaks: points, exact, outcomes, earliest to reach the total; full ties share a rank", () => {
  const r = rankRows([
    { handle: "late", points: 10, exact: 2, outcomes: 5, reachedAt: "2026-10-20T10:00:00Z" },
    { handle: "early", points: 10, exact: 2, outcomes: 5, reachedAt: "2026-10-19T10:00:00Z" },
    { handle: "exact", points: 10, exact: 3, outcomes: 4, reachedAt: "2026-10-21T10:00:00Z" },
    { handle: "top", points: 12, exact: 0, outcomes: 9, reachedAt: null },
    { handle: "twin", points: 10, exact: 2, outcomes: 5, reachedAt: "2026-10-19T10:00:00Z" },
  ]);
  assert.deepEqual(r.map((x) => [x.handle, x.rank]), [["top", 1], ["exact", 2], ["early", 3], ["twin", 3], ["late", 5]]);
});
test("rank tiers: thresholds, progress and next tier", () => {
  assert.deepEqual(TIERS.map((t) => t.min), [0, 25, 75, 150, 300, 500]);
  assert.equal(rankFor(0).tier.id, "rookie"); assert.equal(rankFor(24).tier.id, "rookie"); assert.equal(rankFor(25).tier.id, "bronze");
  assert.equal(rankFor(74).toNext, 1); assert.equal(rankFor(150).tier.id, "gold"); assert.equal(rankFor(499).next.id, "legend");
  const l = rankFor(9999); assert.equal(l.tier.id, "legend"); assert.equal(l.next, null); assert.equal(l.progress, 1);
  assert.equal(rankFor(50).progress, 0.5); assert.equal(rankFor(-5).tier.id, "rookie"); assert.equal(rankFor("abc").points, 0);
});
