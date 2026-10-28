// Scheduler status for verification: current plan (per-league modes/intervals), budget window, recent calls per
// minute, and this instance's counters. Contains no secrets and no member data.
import { db } from "../../../../lib/db.js";
import { currentPlan, budgetStatus, counters } from "../../../../lib/fdScheduler.js";
import { BUDGET } from "../../../../lib/fdPlan.js";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!process.env.DATABASE_URL) return Response.json({ available: false });
  const [plan, budget, jobs, perMinute] = await Promise.all([currentPlan(), budgetStatus(),
    db()`select key, last_try, last_ok, lease_until, fails from fd_jobs order by key`,
    db()`select date_trunc('minute', at) as minute, count(*)::int as calls from fd_calls where at > now() - interval '15 minutes' group by 1 order by 1`]);
  return Response.json({ budgetPerMinute: BUDGET, plan, budget, jobs, perMinute, instance: counters, now: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } });
}
