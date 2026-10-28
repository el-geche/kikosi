import { getAll } from "../../lib/all";
import { MatchCard } from "../../components/ui";
import MembersList from "../../components/MembersList";
export const dynamic = "force-dynamic";
export const metadata = { title: "Predict scores · Kikosi" };
export default async function Predict() {
  const on = !!process.env.DATABASE_URL && !!process.env.SESSION_SECRET;
  const all = await getAll(), now = Date.now();
  const soon = all.flatMap((l) => l.upcoming.filter((m) => m.fdId && m.ko > now).map((m) => ({ ...m, lg: l.league.name })))
    .sort((a, b) => a.ko - b.ko).slice(0, 24);
  return <>
    <div className="hero"><h1>Predict the <span className="grad">score</span></h1>
      <p>Pick the final score before kick-off. Predictions lock at kick-off (server time) and are settled automatically after full time: 3 pts exact score, 2 pts right result and goal difference, 1 pt right result.</p>
      <div className="note" style={{ marginTop: 12 }}><b>A free prediction game for fun. Not betting. No money in, no money out.</b> Other members’ picks are hidden until kick-off; before then you only see an anonymous split once 3+ members have picked.</div></div>
    <div className={on ? "with-side" : ""}>
      <section>{soon.length ? <div className="grid">{soon.map((m, i) => <MatchCard key={m.id} m={m} i={i} />)}</div> : <p className="mini">No upcoming fixtures with a football-data match id right now.</p>}</section>
      {on && <MembersList mode="side" />}
    </div>
    {on && <MembersList mode="sheet" />}
  </>;
}
