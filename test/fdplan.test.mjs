import test from "node:test";
import assert from "node:assert/strict";
import { plan, dueJobs, nextDue, backoffSeconds, MemoryBudget, BUDGET, CODES, leagueMode } from "../lib/fdPlan.js";

const modes = (live = [], upcoming = []) => Object.fromEntries(CODES.map((c) => [c, live.includes(c) ? "live" : upcoming.includes(c) ? "upcoming" : "idle"]));
// Drive a schedule like the runtime does (tick every second, one due job per tick, shared budget) and record call times.
async function simulate(m, seconds, { starting = false, concurrency = 1 } = {}) {
  let t = 1_700_000_000_000; const b = new MemoryBudget({ now: () => t }); const p = plan(m, { starting }); const last = {}; const calls = [];
  for (let s = 0; s < seconds; s++, t += 1000) {
    const due = dueJobs(p, last, t); if (!due.length) continue;
    // `concurrency` instances race for the same job: exactly one may win.
    const res = await Promise.all(Array.from({ length: concurrency }, () => b.acquire(due[0].key, null, 25)));
    if (res.includes("ok")) { calls.push({ t, key: due[0].key }); last[due[0].key] = t; b.report(due[0].key, 200); }
  }
  return calls;
}
const maxPerWindow = (calls) => { let mx = 0; for (const c of calls) mx = Math.max(mx, calls.filter((d) => d.t > c.t - 60e3 && d.t <= c.t).length); return mx; };

test("league mode", () => {
  assert.equal(leagueMode({ live: 1 }), "live"); assert.equal(leagueMode({ soon: 2 }), "upcoming"); assert.equal(leagueMode({}), "idle");
});
test("plan stays within budget for every combination of live leagues", () => {
  for (let k = 0; k <= 5; k++) for (const starting of [false, true]) {
    const p = plan(modes(CODES.slice(0, k)), { starting });
    assert.ok(p.perMinute <= BUDGET, `${k} live: ${p.perMinute}/min`);
  }
});
test("cadence: idle 15 min, upcoming 5 min, one live league ~15 s + live call 60 s, two live -> live call 20 s", () => {
  const idle = plan(modes()); assert.ok(idle.jobs.every((j) => j.interval === 900)); assert.ok(!idle.jobs.some((j) => j.kind === "live"));
  const up = plan(modes([], ["PL"])); assert.equal(up.jobs.find((j) => j.key === "league:PL").interval, 300);
  const one = plan(modes(["PL"])); assert.equal(one.jobs.find((j) => j.key === "league:PL").interval, 15); assert.equal(one.jobs.find((j) => j.kind === "live").interval, 60);
  const two = plan(modes(["PL", "SA"])); assert.equal(two.jobs.find((j) => j.kind === "live").interval, 20);
  for (const c of ["PL", "SA"]) assert.ok(two.jobs.find((j) => j.key === `league:${c}`).interval <= 30);
  const all = plan(modes(CODES)); assert.ok(all.jobs.filter((j) => j.mode === "live").every((j) => j.interval <= 60));
});
test("priority ordering: live call, then live leagues, then upcoming, then idle; stagger 12 s", () => {
  const p = plan(modes(["BL1"], ["PL"]), { starting: true });
  assert.deepEqual(p.jobs.map((j) => j.key), ["live", "league:BL1", "league:PL", "league:PD", "league:SA", "league:FL1"]);
  const d = dueJobs(p, {}, 0); assert.equal(d[0].key, "live"); assert.equal(d[1].key, "league:BL1");
  assert.deepEqual(plan(modes()).jobs.map((j) => j.offset), [0, 12, 24, 36, 48]);
});
test("nextDue keeps a staggered grid and never-run jobs are due now", () => {
  assert.equal(nextDue(null, 60, 12, 5000), 5000);
  assert.equal(nextDue(0, 60, 12), 72000);       // 80% of 60 s = 48 s -> next slot at 72 s
  assert.equal(nextDue(75000, 60, 12), 132000);  // a late run doesn't push the grid
});
test("simulated 10 minutes never exceeds 9 calls in any rolling minute (0, 1, 2, 5 live leagues)", async () => {
  for (const live of [[], ["PL"], ["PL", "SA"], CODES]) {
    const calls = await simulate(modes(live), 600);
    assert.ok(maxPerWindow(calls) <= BUDGET, `${live.length} live -> ${maxPerWindow(calls)}`);
  }
});
test("budget is never exceeded under heavy concurrency (200 parallel acquires, many jobs)", async () => {
  let t = 0; const b = new MemoryBudget({ now: () => t });
  for (let round = 0; round < 5; round++, t += 20e3) {
    const res = await Promise.all(Array.from({ length: 200 }, (_, i) => b.acquire(`job${i % 40}:${round}`)));
    assert.ok(b.inWindow() <= BUDGET, `round ${round}: ${b.inWindow()}`);
    assert.ok(res.filter((r) => r === "ok").length <= BUDGET);
  }
});
test("the same job raced by 50 instances is fetched once (lease)", async () => {
  const b = new MemoryBudget({ now: () => 0 });
  const res = await Promise.all(Array.from({ length: 50 }, () => b.acquire("league:PL")));
  assert.equal(res.filter((r) => r === "ok").length, 1); assert.ok(res.filter((r) => r !== "ok").every((r) => r === "leased"));
});
test("simulated schedule with 8 racing instances still stays within budget", async () => {
  const calls = await simulate(modes(["PL", "BL1"]), 300, { concurrency: 8 });
  assert.ok(maxPerWindow(calls) <= BUDGET);
});
test("429 backoff: reset hint wins, otherwise 15 s doubling capped at 240 s; blocks until expiry, resets on success", async () => {
  assert.equal(backoffSeconds(0), 15); assert.equal(backoffSeconds(1), 30); assert.equal(backoffSeconds(3), 120); assert.equal(backoffSeconds(9), 240);
  assert.equal(backoffSeconds(0, 50), 50);
  let t = 0; const b = new MemoryBudget({ now: () => t });
  assert.equal(await b.acquire("a"), "ok"); b.report("a", 429);
  t = 14e3; assert.equal(await b.acquire("b"), "backoff");
  t = 15.5e3; assert.equal(await b.acquire("b"), "ok"); b.report("b", 429);
  t = 15.5e3 + 29e3; assert.equal(await b.acquire("c"), "backoff");
  t = 15.5e3 + 31e3; assert.equal(await b.acquire("c"), "ok"); b.report("c", 200);
  assert.equal(b.backoffN, 0);
});
test("honours X-Requests-Available-Minute: stops at <=1 remaining until the reset", async () => {
  let t = 0; const b = new MemoryBudget({ now: () => t });
  assert.equal(await b.acquire("a"), "ok"); b.report("a", 200, 1, 30);
  assert.equal(await b.acquire("b"), "remote");
  t = 31e3; assert.equal(await b.acquire("b"), "ok");
});
