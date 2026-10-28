import test from "node:test";
import assert from "node:assert/strict";
import { inPlayProbs, playedMinutes, livePoints, provisionalMoves, memberSplit, sseFrame, sseComment, parseCursor, selectRecap, pollDelay, weekKey, weekFromKey } from "../lib/live.js";
import { countdownParts } from "../lib/countdown.js";
import { eatWeek } from "../lib/game.js";

test("in-play probabilities sum to 1 and react to the score", () => {
  const p0 = inPlayProbs(1.5, 1.1, 0, 0, 0), s = p0.H + p0.D + p0.A;
  assert.ok(Math.abs(s - 1) < 1e-9); assert.ok(p0.H > p0.A);
  const lead = inPlayProbs(1.5, 1.1, 0, 1, 80); assert.ok(lead.A > 0.8, `away leading late: ${lead.A}`);
  const end = inPlayProbs(1.5, 1.1, 2, 2, 90); assert.ok(end.D > 0.9); assert.equal(end.score, "2-2");
  assert.equal(inPlayProbs(1, 1, 1, 0, 45).provisional, true);
});
test("played minutes estimate (no match clock on the free tier)", () => {
  const ko = 0; assert.equal(playedMinutes(ko, 10 * 60e3, "IN_PLAY"), 10); assert.equal(playedMinutes(ko, 50 * 60e3, "IN_PLAY"), 45);
  assert.equal(playedMinutes(ko, 30 * 60e3, "PAUSED"), 45); assert.equal(playedMinutes(ko, 75 * 60e3, "IN_PLAY"), 60); assert.equal(playedMinutes(ko, 200 * 60e3, "IN_PLAY"), 90);
  assert.equal(playedMinutes(ko, -5e3, "IN_PLAY"), 0);
});
test("live points if it ends now", () => {
  assert.equal(livePoints({ home_goals: 2, away_goals: 1 }, 2, 1), 3); assert.equal(livePoints({ home_goals: 2, away_goals: 1 }, 1, 0), 2);
  assert.equal(livePoints({ home_goals: 3, away_goals: 1 }, 1, 0), 1); assert.equal(livePoints({ home_goals: 0, away_goals: 0 }, 1, 0), 0);
});
test("provisional rank movement", () => {
  const r = provisionalMoves([{ handle: "a", points: 10, live: 0 }, { handle: "b", points: 9, live: 3 }, { handle: "c", points: 8, live: 0 }]);
  assert.deepEqual(r.map((x) => [x.handle, x.rank, x.provisionalRank, x.move]), [["b", 2, 1, 1], ["a", 1, 2, -1], ["c", 3, 3, 0]]);
});
test("countdown edges: locked exactly at kickoff, unlocked 1 ms before", () => {
  assert.equal(countdownParts(1000, 999).locked, false); assert.equal(countdownParts(1000, 1000).locked, true); assert.equal(countdownParts(1000, 5000).locked, true);
  assert.equal(countdownParts(90061000, 0).label, "1d 01h 01m"); assert.equal(countdownParts(3661000, 0).label, "01:01:01");
});
test("member split hidden below 3 picks, anonymous shares above", () => {
  assert.deepEqual(memberSplit([{ home_goals: 1, away_goals: 0 }, { home_goals: 0, away_goals: 0 }]), { n: 2, shown: false });
  const s = memberSplit([{ home_goals: 1, away_goals: 0 }, { home_goals: 0, away_goals: 0 }, { home_goals: 0, away_goals: 2 }, { home_goals: 3, away_goals: 1 }]);
  assert.deepEqual(s, { n: 4, shown: true, home: 0.5, draw: 0.25, away: 0.25 }); assert.ok(!("picks" in s));
});
test("SSE serialisation: id/event/data on single lines, newlines stripped, cursor parsing", () => {
  assert.equal(sseFrame({ id: 7, event: "comment", data: { a: "x\ny" } }), 'id: 7\nevent: comment\ndata: {"a":"x\\ny"}\n\n');
  assert.equal(sseFrame({ id: "1\n2", event: "a\rb", data: null, retry: 3000.7 }), "retry: 3000\nid: 12\nevent: ab\ndata: null\n\n");
  assert.equal(sseComment("hi\nthere"), ": hi there\n\n");
  assert.equal(parseCursor("42"), 42); assert.equal(parseCursor("-1"), null); assert.equal(parseCursor("abc"), null); assert.equal(parseCursor(null), 0 === Number(null) ? 0 : null);
});
test("adaptive cross-instance poll: 1 s active, 3 s warm, 5 s quiet", () => {
  assert.equal(pollDelay(0), 1000); assert.equal(pollDelay(29e3), 1000); assert.equal(pollDelay(60e3), 3000); assert.equal(pollDelay(600e3), 5000);
});
test("recap selection is deterministic and picks the right highlights", () => {
  const pins = selectRecap({
    reactionsByTarget: [{ handle: "a", count: 5 }, { handle: "b", count: 9 }, { handle: "z", count: 0 }],
    comments: [{ id: 1, targetReactions: 2 }, { id: 2, targetReactions: 7 }],
    exacts: [{ handle: "a", matchId: 1, sameExact: 4, goals: 1 }, { handle: "b", matchId: 2, sameExact: 0, goals: 5 }],
    streaks: [{ handle: "a", streak: 6 }, { handle: "c", streak: 1 }],
    before: [{ handle: "a", rank: 1 }, { handle: "b", rank: 2 }, { handle: "c", rank: 3 }], after: [{ handle: "c", rank: 1 }, { handle: "a", rank: 2 }, { handle: "b", rank: 3 }],
  });
  const by = (k) => pins.filter((p) => p.kind === k).map((p) => p.ref);
  assert.deepEqual(by("reaction"), ["b", "a"]); assert.deepEqual(by("comment"), ["2", "1"]); assert.deepEqual(by("exact"), ["2:b", "1:a"]);
  assert.deepEqual(by("streak"), ["a"]); assert.deepEqual(by("mover"), ["c"]);
  assert.deepEqual(selectRecap({}), []);
});
test("recap week keys round-trip and reject non-Mondays", () => {
  const w = eatWeek(Date.parse("2026-10-28T09:00:00Z"));
  assert.equal(weekKey(w.start), "2026-10-26"); assert.equal(weekFromKey("2026-10-26"), w.start);
  assert.equal(weekFromKey("2026-10-27"), null); assert.equal(weekFromKey("2026-02-30"), null); assert.equal(weekFromKey("x"), null);
});
