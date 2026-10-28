"use client";
// Score prediction inside a MatchCard. All boxes on a page share ONE batched GET /api/predictions (40 ms window).
// Countdown to kickoff (EAT) that locks the form at zero; the server enforces the same lock with the database clock.
import { useEffect, useState } from "react";
import { countdownParts } from "../lib/live.js";
const B = typeof window === "undefined" ? null : (window.__kikosiPb ??= { want: new Map(), timer: null, cache: new Map() });
function load(id) {
  return new Promise((resolve) => {
    if (B.cache.has(id)) return resolve(B.cache.get(id));
    (B.want.get(id) || B.want.set(id, []).get(id)).push(resolve);
    clearTimeout(B.timer);
    B.timer = setTimeout(async () => {
      const batch = new Map(B.want); B.want.clear();
      let j = { mine: {}, split: {}, available: false, signedIn: false };
      try { const r = await fetch(`/api/predictions?ids=${[...batch.keys()].join(",")}`, { cache: "no-store" }); if (r.ok) j = await r.json(); } catch {}
      for (const [k, fs] of batch) { const v = { available: j.available, signedIn: j.signedIn, mine: j.mine?.[k] || null, split: j.split?.[k] || null }; B.cache.set(k, v); fs.forEach((f) => f(v)); }
    }, 40);
  });
}
export function Countdown({ koMs, onLock }) {
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const c = countdownParts(koMs, now ?? koMs - 1); // before hydration: unlocked placeholder
  useEffect(() => { if (now != null && c.locked) onLock?.(); }, [now, c.locked]); // eslint-disable-line react-hooks/exhaustive-deps
  const eat = new Date(koMs).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
  return <span className={`cd${c.locked ? " locked" : ""}`} data-testid="countdown" title={`Kick-off ${eat} EAT`}>{now == null ? "…" : c.locked ? "🔒 Locked" : `⏱ ${c.label}`}</span>;
}
const pct = (x) => `${Math.round(x * 100)}%`;
export default function PredictBox({ matchId, koMs, home, away }) {
  const [st, setSt] = useState(null), [h, setH] = useState(""), [a, setA] = useState(""), [msg, setMsg] = useState(""), [locked, setLocked] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { let on = true; load(matchId).then((v) => { if (!on) return; setSt(v); if (v.mine) { setH(String(v.mine.home)); setA(String(v.mine.away)); } }); return () => { on = false; }; }, [matchId]);
  if (!st || !st.available) return null;
  const sp = st.split;
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg("");
    const r = await fetch("/api/predictions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId, home: Number(h), away: Number(a) }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.ok) { setMsg("Saved ✓"); B.cache.set(matchId, { ...st, mine: { home: j.prediction.home, away: j.prediction.away } }); setSt((s) => ({ ...s, mine: j.prediction })); }
    else { setMsg(j.error || "Couldn't save."); if (r.status === 409) setLocked(true); }
  };
  return <div className="pbox" data-testid="predict-box">
    <div className="pb-top"><b>Your prediction</b><Countdown koMs={koMs} onLock={() => setLocked(true)} /></div>
    {!st.signedIn ? <p className="mini"><a href="/me">Create a free nickname</a> to predict this score.</p> :
      <form onSubmit={save} className="pb-form">
        <label className="sr">{home} goals</label><input aria-label={`${home} goals`} inputMode="numeric" type="number" min="0" max="20" value={h} onChange={(e) => setH(e.target.value)} disabled={locked} required />
        <span>–</span>
        <input aria-label={`${away} goals`} inputMode="numeric" type="number" min="0" max="20" value={a} onChange={(e) => setA(e.target.value)} disabled={locked} required />
        <button className="btn sm" disabled={locked || busy}>{st.mine ? "Update" : "Save"}</button>
        {msg && <span className="mini" role="status">{msg}</span>}
      </form>}
    {sp?.shown ? <p className="mini split">Members: {home} {pct(sp.home)} · draw {pct(sp.draw)} · {away} {pct(sp.away)} <span>({sp.n} picks, anonymous)</span></p>
      : <p className="mini split">Member split appears after 3 picks.</p>}
  </div>;
}
