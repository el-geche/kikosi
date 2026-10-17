"use client";
import { useEffect, useMemo, useState } from "react";
import { pct, fmtDate, Form } from "./ui";
const KEY = "kikosi-pick12", OLD_KEY = "pitchlens-pick12"; // migrate slips saved before the rename
const prob = (m, o) => (o === "1" ? m.H : o === "X" ? m.D : m.A);
export default function JackpotLab({ matches }) {
  const [slip, setSlip] = useState({}); const [ready, setReady] = useState(false); const [view, setView] = useState("build");
  useEffect(() => { try { setSlip(JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY)) || {}); } catch {} setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(slip)); }, [slip, ready]);
  const byId = useMemo(() => Object.fromEntries(matches.map((m) => [m.id, m])), [matches]);
  const picks = Object.entries(slip).filter(([id]) => byId[id]);
  const combined = picks.reduce((p, [id, o]) => p * prob(byId[id], o), 1);
  const toggle = (id, o) => setSlip((s) => { const n = { ...s }; if (n[id] === o) delete n[id]; else { if (!n[id] && Object.keys(n).filter((k) => byId[k]).length >= 12) return s; n[id] = o; } return n; });
  const ranked = [...matches].sort((a, b) => b.pickProb - a.pickProb);
  const autofill = () => setSlip(Object.fromEntries(ranked.slice(0, 12).map((m) => [m.id, m.pick])));
  const odds = picks.length ? 1 / combined : 0;
  return <div className="layout2">
    <div>
      <div className="pick" style={{ maxWidth: 420, marginBottom: 14 }}><button className={view === "build" ? "sel" : ""} onClick={() => setView("build")}>Build slip<small>{matches.length} fixtures</small></button><button className={view === "rank" ? "sel" : ""} onClick={() => setView("rank")}>Likelihood ranking<small>with reasons</small></button></div>
      {view === "build" ? <div className="grid">{matches.map((m, i) => <div key={m.id} className="card hov" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
        <div className="m-top"><span>{fmtDate(m.date)}{m.time ? ` · ${m.time}` : ""}</span><span>{m.flag} {m.lg}</span></div>
        <div className="teams"><div className="team">{m.home}<Form f={m.homeForm} /></div><div className="xg">vs</div><div className="team r">{m.away}<Form f={m.awayForm} /></div></div>
        <div className="pick">{["1", "X", "2"].map((o) => <button key={o} className={slip[m.id] === o ? "sel" : ""} onClick={() => toggle(m.id, o)}>{o}<small>{pct(prob(m, o))} · {(1 / prob(m, o)).toFixed(2)}</small></button>)}</div>
        <p className="mini" style={{ margin: "8px 0 0" }}>History favours <b>{m.favours.team}</b> ({m.pick}). Model estimate, not bookmaker odds.</p>
      </div>)}</div>
      : <div style={{ display: "grid", gap: 12 }}>{ranked.map((m, i) => <div className="card rank" key={m.id} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
        <div className="no">{i + 1}</div>
        <div><div className="m-top"><span>{m.flag} {m.lg} · {fmtDate(m.date)}</span></div><b>{m.home} v {m.away}</b>: history favours <b>{m.pick === "X" ? "a draw" : m.favours.team}</b> ({m.pick})
          <ul>{m.why.map((w, k) => <li key={k}>{w}</li>)}</ul></div>
        <div><div className="meter">{pct(m.pickProb)}</div><div className="mini" style={{ textAlign: "right" }}>fair {(1 / m.pickProb).toFixed(2)}</div></div></div>)}</div>}
    </div>
    <aside className="card sticky" style={{ alignSelf: "start" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Your Pick-12 slip</h2><p className="mini" style={{ marginTop: 0 }}>{picks.length}/12 picks · saved in this browser · play/informational only</p>
      {picks.length ? picks.map(([id, o]) => { const m = byId[id]; return <div className="res" key={id}><span>{m.home} v {m.away}<br /><span className="mini">{m.lg}</span></span><span style={{ textAlign: "right" }}><b>{o}</b><br /><span className="mini">{pct(prob(m, o))}</span></span></div>; }) : <p className="mini">Pick 1, X or 2 on any fixture to start.</p>}
      <div className="slip-total"><span className="mini">Combined model probability</span><b data-testid="combined-prob">{picks.length ? (combined * 100 < 0.01 ? (combined * 100).toExponential(2) : (combined * 100).toFixed(combined * 100 < 1 ? 3 : 1)) + "%" : "–"}</b></div>
      <div className="slip-total"><span className="mini">Combined fair odds (estimate)</span><b data-testid="combined-odds">{picks.length ? (odds >= 1e5 ? Math.round(odds).toLocaleString() : odds.toFixed(2)) : "–"}</b></div>
      {picks.length > 0 && <p className="mini">Roughly 1 in {Math.round(odds).toLocaleString()} by the model’s estimate.</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}><button className="btn" onClick={autofill}>Fill with model favourites</button><button className="btn ghost" onClick={() => setSlip({})}>Clear</button></div>
      <p className="mini" style={{ marginTop: 12 }}>No stakes, no submission, no prizes. Model estimates only, with no guarantee. 18+.</p>
    </aside>
  </div>;
}
