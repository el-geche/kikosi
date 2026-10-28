"use client";
// Fantasy XII: 12 real players on a free pitch. Drag a player (mouse or touch), or tap a player then tap the pitch,
// or use the arrow keys on a selected player. Warnings: at least 1 goalkeeper, max 3 per club.
import { useEffect, useRef, useState } from "react";
import { validateSquad, lineOf, SQUAD_SIZE } from "../lib/fantasy.js";
import { Crest } from "./ClubPicker";
const LG = [["PL", "Premier League"], ["PD", "La Liga"], ["BL1", "Bundesliga"], ["SA", "Serie A"], ["FL1", "Ligue 1"]];
const LINE_Y = { Goalkeeper: 90, Defence: 70, Midfield: 47, Offence: 24, Unknown: 58 };
const SHORT = { Goalkeeper: "GK", Defence: "DEF", Midfield: "MID", Offence: "ATT", Unknown: "?" };
const f2 = (x) => (x == null ? "–" : x.toFixed(2));

function place(players, p) {
  const line = lineOf(p.position), same = players.filter((q) => lineOf(q.position) === line).length;
  const xs = [50, 30, 70, 15, 85, 40, 60];
  const used = new Set(players.map((q) => q.slot)); let slot = 0; while (used.has(slot)) slot++;
  return { ...p, slot, x: xs[same % xs.length], y: Math.min(96, LINE_Y[line] + Math.floor(same / xs.length) * 6) };
}

function Picker({ onAdd, picked }) {
  const [lg, setLg] = useState("PL"), [clubs, setClubs] = useState([]), [team, setTeam] = useState(""), [pos, setPos] = useState(""), [q, setQ] = useState(""), [res, setRes] = useState(null), [err, setErr] = useState("");
  useEffect(() => { setTeam(""); fetch(`/api/clubs?league=${lg}`).then((r) => r.json()).then((j) => setClubs(j.clubs || [])).catch(() => setClubs([])); }, [lg]);
  useEffect(() => { let on = true; const t = setTimeout(async () => { setErr("");
    const r = await fetch(`/api/fantasy/players?league=${lg}&team=${team}&position=${pos}&q=${encodeURIComponent(q)}`); const j = await r.json().catch(() => ({}));
    if (on) { if (r.ok) setRes(j); else setErr(j.error || "Players unavailable."); } }, 200); return () => { on = false; clearTimeout(t); }; }, [lg, team, pos, q]);
  return <div className="picker card" data-testid="player-picker">
    <h3>Pick players</h3>
    <div className="pk-f">
      <select value={lg} onChange={(e) => setLg(e.target.value)} aria-label="League">{LG.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
      <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Club"><option value="">All clubs</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.short}</option>)}</select>
      <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position"><option value="">All positions</option>{["Goalkeeper", "Defence", "Midfield", "Offence"].map((p) => <option key={p}>{p}</option>)}</select>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player" aria-label="Search player" />
    </div>
    {err && <p className="err">{err}</p>}
    <ul className="pk-list">{(res?.players || []).map((p) => { const has = picked.has(p.player_id); return <li key={p.player_id}>
      <Crest src={p.crest} size={18} /><span className="pk-n">{p.name}<small>{p.team} · {SHORT[p.line]}{p.position ? "" : " (no position in data)"}</small></span>
      <button type="button" className="btn sm" disabled={has || picked.size >= SQUAD_SIZE} onClick={() => onAdd(p)}>{has ? "In squad" : "Add"}</button></li>; })}</ul>
    {res && res.total > res.players.length && <p className="mini">Showing {res.players.length} of {res.total}. Narrow by club, position or name.</p>}
  </div>;
}

export default function SquadBuilder() {
  const [players, setPlayers] = useState([]), [name, setName] = useState("My XII"), [sel, setSel] = useState(null), [analysis, setAnalysis] = useState(null), [msg, setMsg] = useState(""), [state, setState] = useState("loading");
  const pitch = useRef(null), drag = useRef(null);
  useEffect(() => { fetch("/api/fantasy", { cache: "no-store" }).then(async (r) => { const j = await r.json();
    if (r.status === 401) return setState("signin"); if (!r.ok) return setState("off");
    setPlayers(j.players.map((p) => ({ ...p, team: p.team || "" }))); setName(j.name); setAnalysis(j.analysis); setState("ready"); }).catch(() => setState("off")); }, []);
  if (state === "loading") return <p className="mini">Loading your squad…</p>;
  if (state === "signin") return <div className="card"><p><a href="/me">Create a free nickname</a> to build a squad.</p></div>;
  if (state === "off") return <div className="card"><p className="mini">Squads aren’t available on this deployment.</p></div>;
  const v = validateSquad(players);
  const move = (slot, x, y) => setPlayers((ps) => ps.map((p) => (p.slot === slot ? { ...p, x: Math.round(Math.max(3, Math.min(97, x)) * 10) / 10, y: Math.round(Math.max(3, Math.min(97, y)) * 10) / 10 } : p)));
  const toPct = (e) => { const r = pitch.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100]; };
  const onDown = (e, p) => { e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { slot: p.slot, moved: false }; setSel(p.slot); };
  const onMove = (e) => { if (!drag.current) return; drag.current.moved = true; const [x, y] = toPct(e); move(drag.current.slot, x, y); };
  const onUp = () => { drag.current = null; };
  const onPitch = (e) => { if (sel == null || drag.current) return; const [x, y] = toPct(e); move(sel, x, y); };
  const onKey = (e, p) => { const d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key]; if (d) { e.preventDefault(); move(p.slot, p.x + d[0], p.y + d[1]); } };
  const save = async () => { setMsg("Saving…");
    const r = await fetch("/api/fantasy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, players: players.map(({ player_id, team_id, competition, slot, x, y, name }) => ({ player_id, team_id, competition, slot, x, y, name })) }) });
    const j = await r.json().catch(() => ({})); if (r.ok) { setAnalysis(j.analysis); setMsg("Saved ✓"); } else setMsg(j.error || "Couldn't save."); };
  const picked = new Set(players.map((p) => p.player_id));
  return <div className="squad">
    <div className="squad-main">
      <div className="card">
        <div className="sq-h"><input className="sq-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} aria-label="Squad name" /><span className="mini">{players.length}/{SQUAD_SIZE}</span>
          <button className="btn" onClick={save} disabled={!v.ok}>Save squad</button></div>
        <div className="pitch" ref={pitch} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onClick={onPitch} data-testid="pitch" role="application" aria-label="Pitch. Select a player, then tap the pitch or use the arrow keys to move them.">
          <div className="pl-lines"><span className="half" /><span className="circle" /><span className="box top" /><span className="box bot" /></div>
          {players.map((p) => <button key={p.player_id} type="button" className={`tok ${SHORT[lineOf(p.position)].toLowerCase()}${sel === p.slot ? " sel" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onPointerDown={(e) => onDown(e, p)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => onKey(e, p)} aria-label={`${p.name}, ${lineOf(p.position)}, ${p.team}`}>
            <b>{SHORT[lineOf(p.position)]}</b><span>{p.name.split(" ").slice(-1)[0]}</span></button>)}
        </div>
        {sel != null && players.find((p) => p.slot === sel) && <p className="mini">Selected: <b>{players.find((p) => p.slot === sel).name}</b>. Tap the pitch or use the arrow keys to move. <button className="linkbtn" onClick={() => { setPlayers(players.filter((p) => p.slot !== sel)); setSel(null); }}>Remove</button></p>}
        {v.warnings.length > 0 && <ul className="warns">{v.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
        {v.errors.length > 0 && <ul className="warns err">{v.errors.map((w) => <li key={w}>{w}</li>)}</ul>}
        {msg && <p className="mini" role="status">{msg}</p>}
      </div>
      <Analysis a={analysis} />
    </div>
    <Picker picked={picked} onAdd={(p) => setPlayers((ps) => (ps.length >= SQUAD_SIZE || ps.some((q) => q.player_id === p.player_id) ? ps : [...ps, place(ps, p)]))} />
  </div>;
}

function Analysis({ a }) {
  if (!a) return <div className="card"><h3>Squad analysis</h3><p className="mini">Save your squad to see an analysis built from real club and scoring data.</p></div>;
  return <div className="card analysis" data-testid="analysis"><h3>Squad analysis</h3>
    <div className="kv">
      <div><span>Shape</span><br />{a.lines.Goalkeeper} GK · {a.lines.Defence} DEF · {a.lines.Midfield} MID · {a.lines.Offence} ATT{a.lines.Unknown ? ` · ${a.lines.Unknown} unknown` : ""}</div>
      <div><span>Spread</span><br />{a.clubs} clubs · {Object.entries(a.leagues).map(([l, n]) => `${l} ${n}`).join(", ")} · max {a.maxFromOneClub} from one club</div>
      <div><span>Avg club attack</span><br />{f2(a.avgClubAttack)} (league avg 1.00; leaders {f2(a.leaders.attack)})</div>
      <div><span>Avg club defence</span><br />{f2(a.avgClubDefence)} (lower is better; leaders {f2(a.leaders.defence)})</div>
      <div><span>Club form</span><br />{a.avgClubPpg5 != null ? `${a.avgClubPpg5.toFixed(2)} pts/game over the last 5` : "–"}</div>
      <div><span>Strongest / weakest line</span><br />{a.strongestLine ? `${a.strongestLine.line} (${f2(a.strongestLine.index)})` : "–"} / {a.weakestLine ? `${a.weakestLine.line} (${f2(a.weakestLine.index)})` : "–"}</div>
      <div><span>Goals + assists</span><br />{a.scoring.goals} G, {a.scoring.assists} A from {a.scoring.playersWithData} player(s) in the top-scorer lists</div>
    </div>
    <p className="mini">Ratings come from each player’s <b>club</b> (model attack/defence vs league average, standings, last-5 form). The free data has no per-player ratings or minutes; goals/assists exist only for players in each league’s top-100 scorers list ({a.scoring.missing} of your players aren’t in it).</p>
    {a.notes?.length > 0 && <ul className="mini">{a.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    <details><summary>Per player</summary><table className="lb"><thead><tr><th>Player</th><th>Club</th><th className="n">Club pos</th><th className="n">Att</th><th className="n">Def</th><th className="n">G/A</th></tr></thead>
      <tbody>{a.perPlayer.map((p) => <tr key={p.player_id}><td>{p.name}</td><td>{p.club?.short || p.team || "–"}</td><td className="n">{p.club?.pos ?? "–"}</td><td className="n">{f2(p.club?.attack)}</td><td className="n">{f2(p.club?.defence)}</td>
        <td className="n">{p.scoring ? `${p.scoring.goals}/${p.scoring.assists ?? "–"}` : "–"}</td></tr>)}</tbody></table></details>
  </div>;
}
