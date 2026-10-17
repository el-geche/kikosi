import Link from "next/link";
import { getAll } from "../lib/all";
import { MatchCard, pct, fmtDate } from "../components/ui";
export const revalidate = 1800;
export default async function Home() {
  const all = await getAll();
  const top = all.flatMap((l) => l.upcoming.map((m) => ({ ...m, lg: l.league.name }))).sort((a, b) => b.pickProb - a.pickProb).slice(0, 6);
  const played = all.reduce((s, l) => s + (l.played || 0), 0), fixtures = all.reduce((s, l) => s + l.upcoming.length, 0);
  return <>
    <div className="hero"><h1>See the match <span className="grad">through the numbers.</span></h1>
      <p>Form guides, head-to-head records, home/away splits and transparent model probabilities for Europe’s top leagues, built from real public match data.</p>
      <div className="chips"><span className="chip"><b>{played}</b> results analysed (2026/27)</span><span className="chip"><b>{fixtures}</b> upcoming fixtures modelled</span><span className="chip">Model: Poisson goals with shrinkage</span><span className="chip">Refreshed every 30 min</span></div></div>
    <section><div className="sec-h"><div><h2>Leagues</h2><p>Tap a league for fixtures, standings and form.</p></div></div>
      <div className="lg-tiles">{all.map((l, i) => <Link key={l.league.slug} href={`/${l.league.slug}`} className="card hov lg" style={{ animationDelay: `${i * 60}ms` }}>
        <div className="big">{l.league.flag}</div><h3>{l.league.name}</h3><div className="mini">{l.league.country} · {l.played ?? 0} results · leader: <b>{l.standings[0]?.short ?? "–"}</b></div>
        <div className="mini">{l.upcoming.length} upcoming fixtures modelled</div></Link>)}</div></section>
    <section><div className="sec-h"><div><h2>Where history points most clearly</h2><p>Upcoming matches with the highest model probability for a single outcome. Estimates, not predictions.</p></div><Link className="btn" href="/jackpot">Open Pick-12 Lab →</Link></div>
      <div className="grid">{top.map((m, i) => <MatchCard key={m.id} m={{ ...m, round: m.lg }} i={i} />)}</div></section>
  </>;
}
