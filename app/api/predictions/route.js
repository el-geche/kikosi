// GET ?ids=1,2,3 -> { mine: { [matchId]: pick } (signed-in only), split: { [matchId]: anonymous aggregate } }
// POST { matchId, home, away } -> saves a pick; the kickoff lock is enforced in SQL with the database clock.
import { json, badRequestOrigin, readJson, configured } from "../../../lib/api.js";
import { currentMember } from "../../../lib/memberStore.js";
import { savePrediction, getMatch, myPredictions } from "../../../lib/gameStore.js";
import { splits } from "../../../lib/socialStore.js";
import { validScore, isPredictionOpen } from "../../../lib/game.js";
import { etagJson } from "../../../lib/http.js";
export const dynamic = "force-dynamic";

const ids = (s) => [...new Set(String(s || "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60);
export async function GET(req) {
  if (!configured()) return json({ mine: {}, split: {}, available: false });
  const list = ids(new URL(req.url).searchParams.get("ids"));
  const m = await currentMember();
  const mine = m ? Object.fromEntries((await myPredictions(m.id, list)).map((p) => [p.match_id, { home: p.home_goals, away: p.away_goals, points: p.points, voided: p.voided }])) : {};
  return etagJson(req, { mine, split: await splits(list), signedIn: !!m, available: true });
}
export async function POST(req) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  if (!configured()) return json({ error: "Predictions aren't available on this deployment yet." }, 503);
  const m = await currentMember(); if (!m) return json({ error: "Create a free account first." }, 401);
  const b = await readJson(req);
  const matchId = Number(b.matchId), h = Number(b.home), a = Number(b.away);
  if (!Number.isInteger(matchId) || !validScore(h, a)) return json({ error: "Enter a score between 0 and 20 for each side." }, 400);
  const match = await getMatch(matchId);
  if (!match) return json({ error: "Unknown match." }, 404);
  if (!isPredictionOpen(match)) return json({ error: "Predictions are locked: this match has kicked off." }, 409);
  const saved = await savePrediction(m.id, matchId, h, a);
  if (!saved) return json({ error: "Predictions are locked: this match has kicked off." }, 409);
  return json({ ok: true, prediction: { matchId, home: saved.home_goals, away: saved.away_goals } });
}
