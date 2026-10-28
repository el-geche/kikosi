// Shared profile header for /me and /m/[handle]: big rank icon, tier, points, progress to next tier, streak flame, badge wall.
import RankIcon, { Flame } from "./RankIcon";
import { rankFor } from "../lib/ranks.js";
import { Crest } from "./ClubPicker";
const day = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
export function RankCard({ p, club, you }) {
  const r = rankFor(p.points);
  return <div className="card rankcard" data-testid="rank-card">
    <RankIcon tier={r.tier.id} size={84} />
    <div className="rc-body">
      <h2>@{p.handle}{you && <em className="mini"> (you)</em>} <Flame n={p.current_streak} /></h2>
      <div className="rc-tier" style={{ color: r.tier.accent }}>{r.tier.name}</div>
      <div className="rc-pts"><b>{r.points}</b> pts</div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.progress * 100)} aria-label="Progress to next rank">
        <span style={{ width: `${Math.round(r.progress * 100)}%`, background: r.tier.color }} /></div>
      <p className="mini">{r.next ? <>{r.toNext} pts to <b>{r.next.name}</b></> : "Top rank reached."}</p>
      <div className="kv small">
        <div><span>Predictions</span><br />{p.predictions}</div><div><span>Settled</span><br />{p.settled}</div>
        <div><span>Exact scores</span><br />{p.exact}</div><div><span>Correct outcomes</span><br />{p.outcomes}</div>
        <div><span>Current streak</span><br />{p.current_streak}</div><div><span>Best streak</span><br />{p.best_streak}</div>
      </div>
      {club && <p className="fav"><Crest src={club.crest} size={22} alt="" /> Supports <b>{club.short}</b></p>}
    </div>
  </div>;
}
export function BadgeWall({ badges }) {
  const got = badges.filter((b) => b.awarded_at).length;
  return <div className="card" data-testid="badges"><div className="sec-h"><h2>Badges</h2><span className="mini">{got}/{badges.length}</span></div>
    <ul className="badges">{badges.map((b) => <li key={b.id} className={b.awarded_at ? "got" : "locked"} title={b.description}>
      <span className="b-ic" aria-hidden="true">{b.icon}</span><b>{b.name}</b><span className="mini">{b.awarded_at ? `Earned ${day(b.awarded_at)}` : b.description}</span></li>)}</ul></div>;
}
