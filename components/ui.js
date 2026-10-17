export const pct = (x) => `${(x * 100).toFixed(0)}%`;
export const fair = (p) => (p > 0 ? (1 / p).toFixed(2) : "–");
export const fmtDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
export function Form({ f }) { return <div className="form">{f.length ? f.map((r, i) => <span key={i} className={`f ${r}`}>{r}</span>) : <span className="mini">no games yet</span>}</div>; }
export function MatchCard({ m, i = 0 }) {
  const best = Math.max(m.H, m.D, m.A);
  return <article className="card hov" style={{ animationDelay: `${i * 40}ms` }}>
    <div className="m-top"><span>{fmtDate(m.date)}{m.time ? ` · ${m.time}` : ""}</span><span>{m.round}</span></div>
    <div className="teams">
      <div className="team">{m.home}<Form f={m.homeForm} /></div>
      <div className="xg" title="Model expected goals">xG {m.lh.toFixed(1)}–{m.la.toFixed(1)}</div>
      <div className="team r">{m.away}<Form f={m.awayForm} /></div>
    </div>
    <div className="pbar"><span className="h" style={{ width: pct(m.H) }} /><span className="d" style={{ width: pct(m.D) }} /><span className="a" style={{ width: pct(m.A) }} /></div>
    <Markets m={m} />
    <Compare m={m} />
    <details><summary>More match analysis</summary>
      <div className="kv">
        <div><span>{m.home} at home</span><br />{m.homeSplit.w}W {m.homeSplit.d}D {m.homeSplit.l}L · GF {m.homeSplit.gf} GA {m.homeSplit.ga}</div>
        <div><span>{m.away} away</span><br />{m.awaySplit.w}W {m.awaySplit.d}D {m.awaySplit.l}L · GF {m.awaySplit.gf} GA {m.awaySplit.ga}</div>
        <div><span>Goals/game (all)</span><br />{m.homeAll.p ? (m.homeAll.gf / m.homeAll.p).toFixed(2) : "–"} for · {m.homeAll.p ? (m.homeAll.ga / m.homeAll.p).toFixed(2) : "–"} against</div>
        <div><span>Goals/game (all)</span><br />{m.awayAll.p ? (m.awayAll.gf / m.awayAll.p).toFixed(2) : "–"} for · {m.awayAll.p ? (m.awayAll.ga / m.awayAll.p).toFixed(2) : "–"} against</div>
        <div><span>Most likely score</span><br />{m.score}</div>
      </div>
      <p className="mini" style={{ margin: "10px 0 4px" }}><b>Head-to-head</b> (last {m.h2h.length || 0}, since 2025/26)</p>
      {m.h2h.length ? m.h2h.map((h, k) => <div className="res" key={k}><span>{h.home} v {h.away}</span><b>{h.hg}–{h.ag}</b></div>) : <p className="mini">No recent meetings in the data.</p>}
    </details>
  </article>;
}

export function Compare({ m }) {
  const c = m.compare, favSide = m.favours.pick === "1" ? "home" : m.favours.pick === "2" ? "away" : null;
  const rows = [
    ["Record (all data)", (t) => `${t.w}W ${t.d}D ${t.l}L`],
    ["Last 5", (t) => <Form f={t.form} />],
    ["Goals for / game", (t) => t.gfpg.toFixed(2)],
    ["Goals against / game", (t) => t.gapg.toFixed(2)],
    ["Venue split", (t) => `${t.venue === "home" ? "Home" : "Away"}: ${t.split.w}W ${t.split.d}D ${t.split.l}L (${t.split.gf}-${t.split.ga})`],
  ];
  return <div className="cmp">
    <div className="cmp-head"><div className={favSide === "home" ? "favd" : ""}>{c.home.name}{favSide === "home" && <span className="tag">History favours</span>}</div>
      <div className={favSide === "away" ? "favd r" : "r"}>{favSide === "away" && <span className="tag">History favours</span>}{c.away.name}</div></div>
    {rows.map(([l, f]) => <div className="cmp-row" key={l}><div>{f(c.home)}</div><span>{l}</span><div className="r">{f(c.away)}</div></div>)}
    <div className="cmp-row"><div>{c.h2h.hw} wins</div><span>H2H ({c.h2hN}) · {c.h2h.d} draws</span><div className="r">{c.h2h.aw} wins</div></div>
    <div className="fav-line"><b>{favSide ? `History favours ${m.favours.team}` : "History favours a draw"} ({m.favours.pick}, model {pct(m.pickProb)}, fair odds {fair(m.pickProb)}):</b> {m.favours.reason}.</div>
  </div>;
}

export function Markets({ m }) {
  const res = [["1", "Home win", m.H], ["X", "Draw", m.D], ["2", "Away win", m.A]];
  const fav1x2 = res.reduce((a, b) => (b[2] > a[2] ? b : a));
  const u25 = 1 - m.o25, goalsFav = m.o25 >= u25 ? "o25" : "u25";
  const mk = [...res.map(([k, l, p]) => ({ k, l, p, fav: k === fav1x2[0] })), { k: "o25", l: "Over 2.5", p: m.o25, fav: goalsFav === "o25" }, { k: "u25", l: "Under 2.5", p: u25, fav: goalsFav === "u25" }, { k: "btts", l: "BTTS yes", p: m.btts, fav: false }];
  const tot = m.lh + m.la;
  const goalsWhy = `${tot.toFixed(2)} total expected goals; ${m.home} ${m.homeAll.p ? ((m.homeAll.gf + m.homeAll.ga) / m.homeAll.p).toFixed(1) : "–"} and ${m.away} ${m.awayAll.p ? ((m.awayAll.gf + m.awayAll.ga) / m.awayAll.p).toFixed(1) : "–"} total goals per game in their 2026/27 matches`;
  const resLabel = fav1x2[0] === "1" ? `${m.home} win` : fav1x2[0] === "2" ? `${m.away} win` : "Draw";
  return <div className="mk-wrap">
    <div className="mk">{mk.map((x) => <div key={x.k} className={`mk-cell${x.fav ? " fav" : ""}`}><span className="mk-l">{x.l}</span><b>{pct(x.p)}</b><span className="mk-o">{fair(x.p)}</span></div>)}</div>
    <div className="read"><span className="tag">Model read</span> History favours <b>{resLabel}</b> and <b>{goalsFav === "o25" ? "Over 2.5" : "Under 2.5"}</b>: {m.favours.reason.replace(/^./, (c) => c.toLowerCase())}; {goalsWhy}.</div>
    <p className="mini" style={{ margin: "6px 0 0" }}>Probability % and fair odds are model estimates, not bookmaker odds. No guarantees.</p>
  </div>;
}
