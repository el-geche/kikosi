// Polling fallback for clients without a working EventSource: GET ?after=<id> -> { events, cursor }. ETag/304 when idle.
import { eventsAfter, latestEventId } from "../../../lib/events.js";
import { tick } from "../../../lib/fdScheduler.js";
import { parseCursor } from "../../../lib/live.js";
import { etagJson } from "../../../lib/http.js";
export const dynamic = "force-dynamic";
export async function GET(req) {
  if (!process.env.DATABASE_URL) return Response.json({ events: [], cursor: 0 });
  let after = parseCursor(new URL(req.url).searchParams.get("after"));
  if (after == null) return etagJson(req, { events: [], cursor: await latestEventId() });
  tick().catch(() => {});
  const events = await eventsAfter(after, 100);
  return etagJson(req, { events: events.map((e) => ({ id: e.id, kind: e.kind, data: { ...e.payload, _id: e.id, _t: e.t } })), cursor: events.at(-1)?.id ?? after });
}
