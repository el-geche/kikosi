import test from "node:test";
import assert from "node:assert/strict";
import { publicMember, PUBLIC_MEMBER_FIELDS, publicPredictions, canReactToPrediction, validateComment, commentAllowed, toggleReaction, adminHandles } from "../lib/social.js";
import { validateSquad, analyseSquad } from "../lib/fantasy.js";
import { etagOf, etagMatches, rateLimited } from "../lib/http.js";

test("public member payload is a strict whitelist", () => {
  const m = publicMember({ id: "uuid", handle: "kb", points: 80, current_streak: 3, best_streak: 4, weekly: 6, badge_count: 2, recovery_hash: "x", ip_hash: "y", created_at: new Date() });
  assert.deepEqual(Object.keys(m), PUBLIC_MEMBER_FIELDS); assert.equal(m.tier, "silver"); assert.ok(!("id" in m) && !("recovery_hash" in m));
});
test("other members' picks are never shown before kickoff", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  const rows = [{ match_id: 1, kickoff_utc: "2026-10-28T13:00:00Z", home_goals: 1, away_goals: 0 }, { match_id: 2, kickoff_utc: "2026-10-28T11:00:00Z", home_goals: 2, away_goals: 2, ft_home: null }];
  const out = publicPredictions(rows, now); assert.deepEqual(out.map((p) => p.matchId), [2]); assert.equal(out[0].pick, "2-2");
  assert.equal(canReactToPrediction({ settled_at: null, kickoff_utc: "2026-10-28T11:00:00Z" }, now), false);
  assert.equal(canReactToPrediction({ settled_at: "x", voided: false, kickoff_utc: "2026-10-28T11:00:00Z" }, now), true);
});
test("comment filter: length, links, phones, slurs; mild banter allowed", () => {
  assert.equal(validateComment("Your defence is a disgrace 😂").ok, true);
  assert.equal(validateComment("  ").ok, false); assert.equal(validateComment("x".repeat(141)).ok, false); assert.equal(validateComment("x".repeat(140)).ok, true);
  for (const s of ["visit https://x.co", "go to bet365 . com", "www.foo.ke", "t.me/abc", "call 0712 345 678", "f u c k you", "fvck0ff"]) assert.equal(validateComment(s).ok, false, s);
  assert.equal(commentAllowed(9), true); assert.equal(commentAllowed(10), false);
});
test("reactions toggle and are idempotent with want", async () => {
  const set = new Set(), k = (x) => JSON.stringify(x);
  const store = { has: async (x) => set.has(k(x)), add: async (x) => set.add(k(x)), remove: async (x) => set.delete(k(x)) };
  const a = { reactor: "r", target: "t", emoji: "🔥" };
  assert.equal((await toggleReaction(store, a)).on, true); assert.equal((await toggleReaction(store, a)).on, false);
  await toggleReaction(store, a, "on"); await toggleReaction(store, a, "on"); assert.equal(set.size, 1);
  assert.equal((await toggleReaction(store, { ...a, emoji: "💩" })).ok, false); assert.equal((await toggleReaction(store, { ...a, target: "r" })).ok, false);
  assert.deepEqual([...adminHandles(" Kb, x ,")], ["kb", "x"]);
});
test("squad validation: size, duplicates, GK and max-3-per-club warnings", () => {
  const pl = (i, pos, team = i) => ({ player_id: i, team_id: team, slot: i, x: 50, y: 50, position: pos, name: `P${i}`, team: `T${team}` });
  const outfield = Array.from({ length: 12 }, (_, i) => pl(i, "Midfield", i < 4 ? 99 : i));
  const v = validateSquad(outfield); assert.equal(v.ok, true);
  assert.ok(v.warnings.some((w) => /goalkeeper/i.test(w))); assert.ok(v.warnings.some((w) => /4 players from T99/.test(w)));
  assert.equal(validateSquad([...outfield, pl(12, "Goalkeeper")]).ok, false);
  assert.equal(validateSquad([pl(1, "Goalkeeper"), pl(1, "Defence")]).ok, false);
  assert.equal(validateSquad([{ ...pl(1, "Goalkeeper"), x: 120 }]).ok, false);
});
test("squad analysis reports missing data instead of inventing it", () => {
  const players = [{ player_id: 1, team_id: 10, competition: "PL", position: "Offence" }, { player_id: 2, team_id: 11, competition: "SA", position: "Goalkeeper" }];
  const a = analyseSquad(players, { 10: { short: "A", attack: 1.4, defence: 0.8, ppg5: 2 } }, { 1: { goals: 5, assists: 2 } }, [{ attack: 1.5, defence: 0.7 }]);
  assert.equal(a.ratedPlayers, 1); assert.equal(a.scoring.missing, 1); assert.equal(a.scoring.goals, 5); assert.equal(a.perPlayer[1].club, null);
  assert.ok(Math.abs(a.leaders.attackGap - -0.1) < 1e-9);
});
test("ETag weak comparison and rate limiter", () => {
  const t = etagOf({ a: 1 }); assert.equal(t, etagOf(JSON.stringify({ a: 1 }))); assert.ok(t.startsWith('W/"'));
  assert.equal(etagMatches(t, t), true); assert.equal(etagMatches(`"x", ${t.slice(2)}`, t), true); assert.equal(etagMatches("*", t), true); assert.equal(etagMatches(null, t), false);
  for (let i = 0; i < 3; i++) assert.equal(rateLimited("k", 3, 1000, 0), false); assert.equal(rateLimited("k", 3, 1000, 10), true); assert.equal(rateLimited("k", 3, 1000, 1000), false);
});
