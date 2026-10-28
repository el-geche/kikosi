"use client";
// Favourite club picker: league tabs, then the clubs with crests (football-data teams, cached 24 h server-side).
import { useEffect, useState } from "react";
const LG = [["PL", "Premier League"], ["PD", "La Liga"], ["BL1", "Bundesliga"], ["SA", "Serie A"], ["FL1", "Ligue 1"]];
export function Crest({ src, size = 22, alt = "" }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} width={size} height={size} className="crest" loading="lazy" referrerPolicy="no-referrer" /> : <span className="crest ph" style={{ width: size, height: size }} />;
}
export default function ClubPicker({ value, onPick, busy }) {
  const [lg, setLg] = useState("PL"), [clubs, setClubs] = useState(null), [err, setErr] = useState("");
  useEffect(() => { let on = true; setClubs(null); setErr("");
    fetch(`/api/clubs?league=${lg}`).then(async (r) => { const j = await r.json(); if (!on) return; if (r.ok) setClubs(j.clubs); else setErr(j.error || "Clubs unavailable."); })
      .catch(() => on && setErr("Clubs unavailable.")); return () => { on = false; }; }, [lg]);
  return <div className="clubpick" data-testid="club-picker">
    <div className="tabs small" role="tablist">{LG.map(([c, n]) => <button type="button" key={c} role="tab" aria-selected={lg === c} className={lg === c ? "on" : ""} onClick={() => setLg(c)}>{n}</button>)}</div>
    {err ? <p className="err">{err}</p> : !clubs ? <p className="mini">Loading clubs…</p> :
      <div className="clubs">{clubs.map((c) => <button type="button" key={c.id} disabled={busy} className={value === c.id ? "on" : ""} aria-pressed={value === c.id} onClick={() => onPick({ ...c, league: lg })}>
        <Crest src={c.crest} alt="" /><span>{c.short}</span></button>)}</div>}
  </div>;
}
