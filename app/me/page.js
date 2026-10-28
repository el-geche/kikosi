import MemberPanel from "../../components/MemberPanel";
import { currentMember } from "../../lib/memberStore.js";
import { COMPLIANCE } from "../../lib/members.js";
import { RankCard, BadgeWall } from "../../components/Profile";
import FavClub from "../../components/FavClub";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your Kikosi account · Kikosi" };
export default async function Me() {
  let member = null, p = null, club = null, recent = [], available = !!process.env.DATABASE_URL && !!process.env.SESSION_SECRET;
  if (available) {
    try {
      const m = await currentMember(); member = m && { handle: m.handle, createdAt: m.createdAt.toISOString?.() ?? m.createdAt };
      if (m) {
        const [{ profile, recentPredictions }, { favTeam }] = await Promise.all([import("../../lib/gameStore.js"), import("../../lib/fantasyStore.js")]);
        [p, recent] = await Promise.all([profile(m.handle), recentPredictions(m.id, 10).catch(() => [])]);
        club = p ? await favTeam(p.fav_team_id) : null;
      }
    } catch (e) { console.error("me:", e.message); available = false; }
  }
  return <>
    {!member && <div className="hero"><h1>Your <span className="grad">Kikosi</span> account</h1>
      <p>Pick a nickname to join the free match-prediction game. No phone number, email or password: this device remembers you, and a one-time recovery code lets you sign in on another device.</p>
      <div className="note" style={{ marginTop: 16 }}><b>{COMPLIANCE}</b> No stakes, deposits, payouts or prizes. 18+.</div></div>}
    {p && <div className="profile-grid"><RankCard p={p} club={club} you /><BadgeWall badges={p.badges} /></div>}
    {p && <div className="layout2">
      <div className="card"><h2>Favourite club</h2><FavClub initial={club} /></div>
      <div className="card"><h2>Recent predictions</h2>{recent.length ? <ul className="plist">{recent.map((r) => <li key={r.match_id}>
        <span>{r.home_short} – {r.away_short}</span><span className="mini">pick <b>{r.home_goals}–{r.away_goals}</b>{r.ft_home != null ? ` · FT ${r.ft_home}–${r.ft_away}` : Date.parse(r.kickoff_utc) <= Date.now() ? " · locked" : " · open"}</span>
        {r.voided ? <span className="pts void">void</span> : r.points != null ? <span className={`pts p${r.points}`}>{r.points} pt{r.points === 1 ? "" : "s"}</span> : <span className="pts">…</span>}</li>)}</ul>
        : <p className="mini">No predictions yet. Open any <a href="/predict">upcoming match</a> to make one.</p>}
        <p className="mini"><a href={`/m/${p.handle}`}>See your public wall →</a></p></div></div>}
    <MemberPanel initial={member} available={available} />
  </>;
}
