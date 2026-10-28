// Realtime change feed. Writes go to the Neon `events` table (cross-instance source of truth) AND to an in-memory
// emitter so streams open on the same function instance get them instantly. Payloads never include anyone's picks.
import { EventEmitter } from "node:events";
import { db } from "./db.js";

const g = globalThis;
export const bus = (g.__kikosiBus ??= Object.assign(new EventEmitter(), { _n: 0 }));
bus.setMaxListeners(1000);

/** Inserts an event and notifies local streams. Returns { id, kind, payload, t } (t = server ms, for latency stats). */
export async function publish(kind, payload) {
  const r = await db()`insert into events (kind, payload) values (${kind}, ${JSON.stringify(payload)}::jsonb) returning id, created_at`;
  const ev = { id: Number(r[0].id), kind, payload, t: new Date(r[0].created_at).getTime() };
  bus.emit("event", ev);
  return ev;
}
/** Cheap indexed read (primary key range). */
export async function eventsAfter(cursor, limit = 100) {
  const rows = await db()`select id, kind, payload, created_at from events where id > ${cursor} order by id limit ${limit}`;
  return rows.map((r) => ({ id: Number(r.id), kind: r.kind, payload: r.payload, t: new Date(r.created_at).getTime() }));
}
export async function latestEventId() {
  const r = await db()`select coalesce(max(id), 0)::bigint as id from events`; return Number(r[0].id);
}
export async function pruneEvents() { await db()`delete from events where created_at < now() - interval '3 days'`; }
