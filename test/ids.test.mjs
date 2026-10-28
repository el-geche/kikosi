import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFdMatch } from "../lib/data.js";
import { analyseLeague } from "../lib/model.js";

const fd = (id, utcDate, status, ft = [null, null], home = "Arsenal FC", away = "Chelsea FC") => ({
  id, utcDate, status, matchday: 9, homeTeam: { name: home, shortName: home.replace(" FC", "") }, awayTeam: { name: away, shortName: away.replace(" FC", "") },
  score: { fullTime: { home: ft[0], away: ft[1] }, halfTime: { home: null, away: null } } });

test("mapFdMatch keeps football-data's match id as fdId", () => {
  const m = mapFdMatch(fd(537123, "2026-11-01T16:30:00Z", "TIMED"));
  assert.equal(m.fdId, 537123);
  assert.equal(m.date, "2026-11-01"); assert.equal(m.time, "19:30 EAT");
  assert.equal(m.hg, null);
});
test("mapFdMatch: missing or non-integer id becomes null", () => {
  assert.equal(mapFdMatch({ ...fd(1, "2026-11-01T16:30:00Z", "TIMED"), id: undefined }).fdId, null);
  assert.equal(mapFdMatch({ ...fd(1, "2026-11-01T16:30:00Z", "TIMED"), id: "42" }).fdId, null);
});
test("fdId survives a reschedule while the slug id changes", () => {
  const a = mapFdMatch(fd(777, "2026-11-01T16:30:00Z", "TIMED")), b = mapFdMatch(fd(777, "2026-11-08T16:30:00Z", "TIMED"));
  assert.equal(a.fdId, b.fdId); assert.notEqual(a.date, b.date);
});
test("analyseLeague carries fdId into upcoming, history and live; slug id unchanged", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  const cur = [
    mapFdMatch(fd(1, "2026-10-20T15:00:00Z", "FINISHED", [2, 1])),
    mapFdMatch(fd(2, "2026-10-21T15:00:00Z", "FINISHED", [0, 0], "Chelsea FC", "Arsenal FC")),
    mapFdMatch(fd(3, "2026-10-28T11:00:00Z", "IN_PLAY", [1, 0])),
    mapFdMatch(fd(4, "2026-11-01T16:30:00Z", "TIMED", undefined, "Chelsea FC", "Arsenal FC")),
  ];
  const d = analyseLeague({ cur, prev: [], source: "test", season: "2026/27" }, now);
  assert.deepEqual(d.upcoming.map((m) => m.fdId), [4]);
  assert.equal(d.upcoming[0].id, "2026-11-01-Chelsea-FC-Arsenal-FC");
  assert.deepEqual(d.history.map((m) => m.fdId), [2, 1]);
  assert.deepEqual(d.live.map((m) => m.fdId), [3]);
});
test("openfootball fixtures have fdId null and keep the slug id", () => {
  const cur = [{ date: "2026-11-01", time: "19:30 EAT", ko: Date.parse("2026-11-01T16:30:00Z"), fdId: null, round: "", home: "A", away: "B", status: "SCHEDULED", hg: null, ag: null, ht: null }];
  const d = analyseLeague({ cur, prev: [], source: "openfootball", season: "2026/27" }, Date.parse("2026-10-28T12:00:00Z"));
  assert.equal(d.upcoming[0].fdId, null); assert.equal(d.upcoming[0].id, "2026-11-01-A-B");
});
