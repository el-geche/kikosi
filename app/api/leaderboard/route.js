// Public leaderboard: ?period=week|all (&offset=-1 for last week). CDN-cached ~8 s; "you" is highlighted client-side.
import { configured } from "../../../lib/api.js";
import { leaderboard } from "../../../lib/gameStore.js";
import { eatWeek, MIN_SETTLED_FOR_BOARD } from "../../../lib/game.js";
import { rankFor } from "../../../lib/ranks.js";
import { etagJson } from "../../../lib/http.js";
export const dynamic = "force-dynamic";
export async function GET(req) {
  if (!configured()) return etagJson(req, { rows: [], available: false });
  const sp = new URL(req.url).searchParams, period = sp.get("period") === "week" ? "week" : "all";
  const off = Math.max(-8, Math.min(0, Number(sp.get("offset")) || 0));
  const w = eatWeek(Date.now(), off);
  const b = period === "week" ? await leaderboard({ start: w.start, end: w.end }) : await leaderboard();
  const rows = b.rows.map(({ memberId, ...r }) => ({ ...r, tier: rankFor(r.allTimePoints).tier.id })); // never expose ids
  return etagJson(req, { period, week: period === "week" ? { start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString() } : null,
    rows, total: b.total, minSettled: MIN_SETTLED_FOR_BOARD, available: true }, { cdn: 8 });
}
