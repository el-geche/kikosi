"use client";
// One shared realtime connection per tab. EventSource on /api/stream (Last-Event-ID resume is automatic; the server
// closes after ~4.5 min and we reconnect). Hidden tabs disconnect; on return we reconnect and emit "resume" so views
// refetch. After 3 consecutive errors we fall back to polling /api/events every 3 s (ETag/304).
import { useEffect, useRef } from "react";
const KINDS = ["comment", "comment_removed", "reaction", "live", "final", "settled", "recap"];
const S = typeof window === "undefined" ? null : (window.__kikosiRt ??= { subs: new Set(), es: null, errors: 0, cursor: null, poll: null, seen: new Set(), etag: null });
const lat = () => (window.__kikosiLatency ??= []);
function emit(kind, data) {
  if (data?._id != null) { if (S.seen.has(data._id)) return; S.seen.add(data._id); if (S.seen.size > 500) S.seen.clear(); S.cursor = Math.max(S.cursor || 0, data._id); }
  if (data?._t) lat().push({ kind, id: data._id, ms: Date.now() - data._t, via: S.poll ? "poll" : "sse" });
  for (const f of S.subs) { try { f(kind, data); } catch {} }
}
/** Lets a write response deliver its own event immediately (the stream copy is then de-duplicated by id). */
export function localEvent(ev) { if (S && ev?.id) emit(ev.kind, { ...(ev.payload || ev.data || {}), _id: ev.id }); }
function open() {
  if (!S || S.es || S.poll || document.hidden) return;
  const es = new EventSource(`/api/stream${S.cursor ? `?after=${S.cursor}` : ""}`); S.es = es;
  es.addEventListener("hello", (e) => { S.errors = 0; try { const d = JSON.parse(e.data); if (S.cursor == null) S.cursor = d.cursor; } catch {} });
  for (const k of KINDS) es.addEventListener(k, (e) => { try { emit(k, JSON.parse(e.data)); } catch {} });
  es.addEventListener("bye", () => { es.close(); S.es = null; setTimeout(open, 200); });
  es.onerror = () => { if (es.readyState === 2) { S.es = null; if (++S.errors >= 3) startPoll(); else setTimeout(open, 3000); } else S.errors++; if (S.errors >= 3 && S.es) { es.close(); S.es = null; startPoll(); } };
}
function startPoll() {
  if (S.poll) return;
  const run = async () => {
    if (document.hidden) return;
    try {
      const r = await fetch(`/api/events${S.cursor != null ? `?after=${S.cursor}` : ""}`, { headers: S.etag ? { "If-None-Match": S.etag } : {} });
      if (r.status === 200) { S.etag = r.headers.get("etag"); const j = await r.json(); for (const e of j.events) emit(e.kind, e.data); S.cursor = j.cursor; }
    } catch {}
  };
  run(); S.poll = setInterval(run, 3000);
}
function close() { if (S.es) { S.es.close(); S.es = null; } }
if (S && !S.init) {
  S.init = true;
  document.addEventListener("visibilitychange", () => { if (document.hidden) close(); else { open(); for (const f of S.subs) { try { f("resume", {}); } catch {} } } });
}
export function useRealtime(handler) {
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => { const f = (k, d) => ref.current(k, d); S.subs.add(f); open(); return () => { S.subs.delete(f); if (!S.subs.size) close(); }; }, []);
}
