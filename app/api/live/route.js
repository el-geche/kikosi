// Live board: GET (?demo=1 shows simulated TEST fixtures, never on production). Personalised ("my live points"),
// so private + ETag/304; the expensive parts are shared caches (scheduler feeds, league model).
import { configured, json } from "../../../lib/api.js";
import { currentMember } from "../../../lib/memberStore.js";
import { tick } from "../../../lib/fdScheduler.js";
import { liveBoard } from "../../../lib/liveStore.js";
import { etagJson } from "../../../lib/http.js";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(req) {
  if (!configured()) return json({ error: "Not available." }, 503);
  const demo = new URL(req.url).searchParams.get("demo") === "1" && process.env.VERCEL_ENV !== "production";
  tick().catch(() => {});
  const me = await currentMember();
  return etagJson(req, await liveBoard(me?.id || null, { demo }));
}
