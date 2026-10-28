import { notFound } from "next/navigation";
import Link from "next/link";
import { getRecap } from "../../../lib/socialStore.js";
import { weekFromKey } from "../../../lib/live.js";
import { currentMember } from "../../../lib/memberStore.js";
import { adminHandles } from "../../../lib/social.js";
import PinToggle from "../../../components/RecapAdmin";
export const dynamic = "force-dynamic";
const SECTIONS = [["reaction", "🔥 Most reacted"], ["comment", "💬 Top banter"], ["exact", "🎯 Best exact calls"], ["streak", "📈 Biggest streaks"], ["mover", "🚀 Top movers"]];
const M = ({ h }) => <Link href={`/m/${h}`}>@{h}</Link>;
function Item({ kind, d }) {
  if (kind === "reaction") return <><M h={d.handle} /> got <b>{d.count}</b> reactions</>;
  if (kind === "comment") return <><M h={d.author} /> on <M h={d.target} />’s wall: “{d.body}”</>;
  if (kind === "exact") return <><M h={d.handle} /> called <b>{d.home} {String(d.pick).replace("-", "–")} {d.away}</b>{d.sameExact === 0 ? " (the only one!)" : ` (+${d.sameExact} others)`}</>;
  if (kind === "streak") return <><M h={d.handle} /> on a <b>{d.streak}</b>-match streak</>;
  if (kind === "mover") return <><M h={d.handle} /> climbed <b>{d.move}</b> places{d.from ? ` (${d.from} → ${d.to})` : ` (new → ${d.to})`}</>;
  return null;
}
export async function generateMetadata({ params }) { return { title: `Recap ${params.week} · Kikosi` }; }
export default async function Recap({ params }) {
  const w = weekFromKey(params.week); if (w == null || !process.env.DATABASE_URL) notFound();
  const [r, me] = await Promise.all([getRecap(w), currentMember().catch(() => null)]); if (!r) notFound();
  const admin = !!me && adminHandles().has(me.handle.toLowerCase());
  return <>
    <div className="hero"><h1>{r.title}</h1><p>Week {new Date(w).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" })} – {new Date(w + 6 * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" })} (EAT). Picked automatically{admin ? "; as an admin you can pin or unpin items" : ""}.</p></div>
    <div className="recap">{SECTIONS.map(([k, label]) => { const items = r.pins.filter((p) => p.kind === k && (admin || p.pinned)); return items.length ? <section key={k} className="card">
      <h2>{label}</h2><ul className="plist">{items.map((p) => <li key={p.ref} className={p.pinned ? "" : "unpinned"} data-testid="recap-item"><span><Item kind={k} d={p.data} /></span>
        {admin && <PinToggle week={r.week} kind={k} refId={p.ref} pinned={p.pinned} />}</li>)}</ul></section> : null; })}</div>
    {!r.pins.some((p) => p.pinned) && <p className="mini">Quiet week: nothing to highlight.</p>}
    <p className="mini"><Link href="/recap">All recaps</Link></p>
  </>;
}
