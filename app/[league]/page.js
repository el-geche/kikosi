import { notFound } from "next/navigation";
import { LEAGUES } from "../../lib/data";
import { getOne } from "../../lib/all";
import { MatchCard, Form, fmtDate } from "../../components/ui";
export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return LEAGUES.map((l) => ({ league: l.slug })); }
export async function generateMetadata({ params }) { const l = LEAGUES.find((x) => x.slug === params.league); return { title: `${l?.name} analysis · Pitchlens` }; }
export default async function League({ params }) {
  const d = await getOne(params.league); if (!d) notFound();
  return <>
    <div className="hero"><h1>{d.league.flag} {d.league.name} <span className="grad">2026/27</span></h1>
      <p>Fixtures, side-by-side team histories and model probabilities. League averages: {d.hAvg.toFixed(2)} home goals and {d.aAvg.toFixed(2)} away goals per game.</p>
      <div className="chips"><span className="chip"><b>{d.played}</b> results</span><span className="chip">Results through <b>{d.lastResult ? fmtDate(d.lastResult) : "–"}</b></span>{d.awaiting > 0 && <span className="chip">{d.awaiting} past fixtures awaiting results in source</span>}<span className="chip">Source: {d.source}</span></div></div>
    <section><div className="sec-h"><div><h2>Upcoming fixtures</h2><p>Probabilities and fair odds are model estimates, not bookmaker odds. Kick-off times as listed by the source (local time).</p></div></div>
      {d.upcoming.length ? <div className="grid">{d.upcoming.map((m, i) => <MatchCard key={m.id} m={m} i={i} />)}</div> : <p className="mini">No upcoming fixtures in the data.</p>}</section>
    <section className="layout2"><div className="card"><div className="sec-h"><h2>Standings & form guide</h2></div><div className="scroll"><table><thead><tr><th>#</th><th>Team</th><th className="n">P</th><th className="n">W</th><th className="n">D</th><th className="n">L</th><th className="n">GF</th><th className="n">GA</th><th className="n">GD</th><th className="n">Pts</th><th>Home</th><th>Away</th><th>Last 5</th></tr></thead>
      <tbody>{d.standings.map((t, i) => <tr key={t.name}><td>{i + 1}</td><td><b>{t.short}</b></td><td className="n">{t.p}</td><td className="n">{t.w}</td><td className="n">{t.d}</td><td className="n">{t.l}</td><td className="n">{t.gf}</td><td className="n">{t.ga}</td><td className="n">{t.gd > 0 ? "+" : ""}{t.gd}</td><td className="n"><b>{t.pts}</b></td>
        <td className="mini">{t.home.w}-{t.home.d}-{t.home.l}</td><td className="mini">{t.away.w}-{t.away.d}-{t.away.l}</td><td><Form f={t.form} /></td></tr>)}</tbody></table></div></div>
      <div className="card sticky" style={{ alignSelf: "start" }}><h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Latest results</h2>{d.recent.map((r, i) => <div className="res" key={i}><span>{r.home} v {r.away}<br /><span className="mini">{fmtDate(r.date)}</span></span><b>{r.hg}–{r.ag}</b></div>)}</div></section>
  </>;
}
