// Server-Sent Events: realtime reactions, comments, live scores, settlements and recaps.
// - same-instance writes are pushed instantly through an in-memory emitter (lib/events.js);
// - other instances' writes are picked up by polling the events table (id > cursor, primary-key range scan):
//   every 1 s while active, backing off to 3 s and then 5 s when quiet;
// - resumes from Last-Event-ID (or ?after=); closes after ~4.5 min (the client reconnects; hidden tabs disconnect);
// - each loop also nudges the football-data scheduler (lib/fdScheduler.js), which is budgeted centrally.
import { bus, eventsAfter, latestEventId } from "../../../lib/events.js";
import { tick } from "../../../lib/fdScheduler.js";
import { sseFrame, sseComment, parseCursor, pollDelay } from "../../../lib/live.js";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
const LIFETIME_MS = 270e3, HEARTBEAT_MS = 15e3;

export async function GET(req) {
  if (!process.env.DATABASE_URL) return new Response("Realtime not available", { status: 503 });
  const sp = new URL(req.url).searchParams;
  let cursor = parseCursor(req.headers.get("last-event-id") ?? sp.get("after"));
  if (cursor == null) cursor = await latestEventId();
  const startCursor = cursor;
  const enc = new TextEncoder(), started = Date.now();
  let closed = false, lastActivity = Date.now(), lastBeat = Date.now(), maxSent = cursor;
  const sent = new Set();
  let onEvent, wake;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s) => { if (!closed) { try { controller.enqueue(enc.encode(s)); } catch { closed = true; } } };
      const deliver = (ev) => {
        if (sent.has(ev.id) || ev.id <= startCursor) return; // already delivered, or older than this stream
        sent.add(ev.id); if (sent.size > 2000) sent.clear();
        maxSent = Math.max(maxSent, ev.id); lastActivity = Date.now();
        send(sseFrame({ id: maxSent, event: ev.kind, data: { ...ev.payload, _id: ev.id, _t: ev.t } }));
      };
      onEvent = (ev) => { deliver(ev); };
      bus.on("event", onEvent);
      req.signal.addEventListener("abort", () => { closed = true; wake?.(); });
      send(sseFrame({ retry: 3000, event: "hello", data: { cursor, serverTime: Date.now() } }));
      while (!closed && Date.now() - started < LIFETIME_MS) {
        try {
          const evs = await eventsAfter(cursor, 100);
          for (const ev of evs) { deliver(ev); cursor = Math.max(cursor, ev.id); }
        } catch (e) { send(sseComment("db error, retrying")); }
        tick().catch(() => {});
        if (Date.now() - lastBeat > HEARTBEAT_MS) { send(sseComment("ping")); lastBeat = Date.now(); }
        await new Promise((r) => { wake = r; setTimeout(r, pollDelay(Date.now() - lastActivity)); });
      }
      bus.off("event", onEvent);
      if (!closed) { send(sseFrame({ event: "bye", data: { reconnect: true, cursor: maxSent } })); closed = true; try { controller.close(); } catch {} }
    },
    cancel() { closed = true; if (onEvent) bus.off("event", onEvent); wake?.(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
