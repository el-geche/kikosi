"use client";
// Live matches: score, estimated minute, in-play 1X2 (conditioned on the score), your points if it ends now, and the
// provisional leaderboard. Refreshes on realtime "live"/"final"/"settled" events, with a 20 s ETag poll as fallback.
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import RankIcon from "./RankIcon";
import { useRealtime } from "./useRealtime";
const pct = (x) => `${Math.round(x * 100)}%`;

export default function LiveBoard({ demo }) {
  const [d, setD] = useState(null), [err, setErr] = useState(""); const tag = useRef(null);
  const load = useCallback(async () => {
    try { const r = await fetch(`/api/live${demo ? "?demo=1" : ""}`, { headers: tag.current ? { "If-None-Match": tag.current } : {}, cache: "no-store" });
      if (r.status === 200) { tag.current = r.headers.get("etag"); setD(await r.json()); setErr(""); } else if (r.status !== 304) setErr("Live data unavailable."); } catch { setErr("Live data unavailable."); }
  }, [demo]);
  useEffect(() => { load(); const t = setInterval(() => !document.hidden && load(), 20e3); return () => clearInterval(t); }, [load]);
  useRealtime((k) => { if (["live", "final", "settled", "resume"].includes(k)) load(); });
  if (!d) return <p className="mini">{err || "Loading live matches…"}</p>;
  const mine = Object.fromEntries((d.mine || []).map((x) => [x.fdId, x]));
  return <div data-testid="live-board">
    <p className="note mini">{d.note}{d.demo && <> <b>SIMULATED:</b> cards marked “Simulated test data” are fake fixtures on the preview database, used only to demonstrate this view.</>}</p>
    <div className="grid">{d.matches.length ? d.matches.map((m) => <article key={m.fdId} className={`card live-card${m.simulated ? " sim" : ""}`} data-testid="live-match">
      <div className="m-top"><span><span className="live-dot" />{m.status === "PAUSED" ? "Half-time" : `~${m.minute}′ (est.)`}</span><span>{m.simulated ? "Simulated test data" : m.competition}</span></div>
      <div className="teams"><div className="team">{m.home}</div><div className="score live">{m.liveH}–{m.liveA}</div><div className="team r">{m.away}</div></div>
      {m.inPlay ? <><div className="pbar" aria-hidden="true"><span className="h" style={{ width: pct(m.inPlay.H) }} /><span className="d" style={{ width: pct(m.inPlay.D) }} /><span className="a" style={{ width: pct(m.inPlay.A) }} /></div>
        <p className="mini">In-play model (provisional): {m.home} <b>{pct(m.inPlay.H)}</b> · draw <b>{pct(m.inPlay.D)}</b> · {m.away} <b>{pct(m.inPlay.A)}</b> · likely final {m.inPlay.score.replace("-", "–")}</p></>
        : <p className="mini">No pre-match model for this fixture, so no in-play probabilities.</p>}
      {mine[m.fdId] ? <p className="livepts">Your pick <b>{mine[m.fdId].pick.replace("-", "–")}</b> → <b>{mine[m.fdId].livePoints} pt{mine[m.fdId].livePoints === 1 ? "" : "s"}</b> if it ends now</p>
        : d.me ? <p className="mini">You didn’t predict this one.</p> : null}
    </article>) : <p className="mini">No matches in play right now. This page updates by itself when one kicks off.</p>}</div>
    {d.board.length > 0 && <section><div className="sec-h"><h2>Provisional leaderboard</h2><p>All-time points plus points if every live match ended now. Not final until full time.</p></div>
      <div className="card scroll"><table className="lb"><thead><tr><th>#</th><th>Member</th><th className="n">Pts</th><th className="n">Live</th><th className="n">Move</th></tr></thead>
        <tbody>{d.board.map((r) => <tr key={r.handle} className={r.handle === d.me ? "you" : ""}><td>{r.provisionalRank}</td>
          <td><span className="lb-m"><RankIcon tier={r.tier} size={18} /><Link href={`/m/${r.handle}`}>@{r.handle}</Link></span></td>
          <td className="n">{r.points}</td><td className="n">{r.live ? `+${r.live}` : "–"}</td>
          <td className={`n mv ${r.move > 0 ? "up" : r.move < 0 ? "down" : ""}`}>{r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : "–"}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
