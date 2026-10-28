import { notFound } from "next/navigation";
import { LEAGUES } from "../../lib/data";
import { getOne } from "../../lib/all";
import MembersList from "../../components/MembersList";
import { MatchCard, LiveCard, ResultRow, Form, fmtDate } from "../../components/ui";
// Render per request so live / upcoming / finished is judged against the current time (no build-time freeze).
// Upstream data is cached for 2 min in lib/data.js, so this does not add API calls.
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }) { const l = LEAGUES.find((x) => x.slug === params.league); return { title: `${l?.name} analysis · Kikosi` }; }
export default async function League({ params }) {
  const d = await getOne(params.league); if (!d) notFound();
  return <>
    <div className="hero"><h1>{d.league.flag} {d.league.name} <span className="grad">2026/27</span></h1>
      <p>Fixtures, side-by-side team histories and model probabilities. League averages: {d.hAvg.toFixed(2)} home goals and {d.aAvg.toFixed(2)} away goals per game.</p>
      <div className="chips"><span className="chip"><b>{d.played}</b> results</span>{d.live.length > 0 && <span className="chip"><b>{d.live.length}</b> live now</span>}<span className="chip">Data refreshed automatically</span><span className="chip">Source: {d.source}</span></div></div>
    <section id="live"><div className="sec-h"><div><h2>Live now</h2><p>Matches in progress, with the live score from the data feed. Live matches are not modelled.</p></div></div>
      {d.live.length ? <div className="grid">{d.live.map((m, i) => <LiveCard key={m.id} m={m} i={i} />)}</div> : <p className="mini">No {d.league.name} matches in progress right now.</p>}
      {d.pending.length > 0 && <p className="mini" style={{ marginTop: 8 }}>Awaiting final score from the feed: {d.pending.map((m) => `${m.home} v ${m.away} (${fmtDate(m.date)})`).join(", ")}.</p>}</section>
    <section id="upcoming"><div className="sec-h"><div><h2>Upcoming fixtures</h2><p>Probabilities and fair odds are model estimates, not bookmaker odds. Kick-off times in EAT (Nairobi).</p></div></div>
      {d.upcoming.length ? <div className="grid">{d.upcoming.map((m, i) => <MatchCard key={m.id} m={m} i={i} />)}</div> : <p className="mini">No upcoming fixtures in the data.</p>}
      {d.off.length > 0 && <ul className="status-list">{d.off.map((m, k) => <li key={k}><span className="tag">{m.status === "POSTPONED" ? "Postponed" : m.status === "SUSPENDED" ? "Suspended" : "Cancelled"}</span> {m.home} v {m.away} · was {fmtDate(m.date)} {m.time} · not modelled</li>)}</ul>}</section>
    <section id="history"><div className="sec-h"><div><h2>Recent results</h2><p>Finished {d.league.name} fixtures with final scores, most recent first. Tap a result to preview it. These feed the standings, form guide and model.</p></div></div>
      {d.history.length ? <div className="card">{d.history.map((m) => <ResultRow key={m.id} m={m} />)}</div> : <p className="mini">No finished fixtures in the data yet.</p>}</section>
    <section className="layout2"><div className="card"><div className="sec-h"><h2>Standings & form guide</h2></div><div className="scroll"><table><thead><tr><th>#</th><th>Team</th><th className="n">P</th><th className="n">W</th><th className="n">D</th><th className="n">L</th><th className="n">GF</th><th className="n">GA</th><th className="n">GD</th><th className="n">Pts</th><th>Home</th><th>Away</th><th>Last 5</th></tr></thead>
      <tbody>{d.standings.map((t, i) => <tr key={t.name}><td>{i + 1}</td><td><b>{t.short}</b></td><td className="n">{t.p}</td><td className="n">{t.w}</td><td className="n">{t.d}</td><td className="n">{t.l}</td><td className="n">{t.gf}</td><td className="n">{t.ga}</td><td className="n">{t.gd > 0 ? "+" : ""}{t.gd}</td><td className="n"><b>{t.pts}</b></td>
        <td className="mini">{t.home.w}-{t.home.d}-{t.home.l}</td><td className="mini">{t.away.w}-{t.away.d}-{t.away.l}</td><td><Form f={t.form} /></td></tr>)}</tbody></table></div></div>
      <div className="card sticky" style={{ alignSelf: "start" }}><h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Latest results</h2>{d.recent.map((r, i) => <div className="res" key={i}><span>{r.home} v {r.away}<br /><span className="mini">{fmtDate(r.date)}</span></span><b>{r.hg}–{r.ag}</b></div>)}</div></section>
    {process.env.DATABASE_URL && process.env.SESSION_SECRET ? <MembersList mode="sheet" /> : null}
  </>;
}
