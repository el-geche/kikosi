import { notFound } from "next/navigation";
import { profile } from "../../../lib/gameStore.js";
import { favTeam } from "../../../lib/fantasyStore.js";
import { currentMember } from "../../../lib/memberStore.js";
import { RankCard, BadgeWall } from "../../../components/Profile";
import Wall from "../../../components/Wall";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }) { return { title: `@${decodeURIComponent(params.handle)} · Kikosi` }; }
export default async function Member({ params }) {
  if (!process.env.DATABASE_URL) notFound();
  const h = decodeURIComponent(params.handle).slice(0, 20);
  const [p, me] = await Promise.all([profile(h), currentMember().catch(() => null)]);
  if (!p) notFound();
  const club = await favTeam(p.fav_team_id);
  return <>
    <div className="profile-grid"><RankCard p={p} club={club} you={me?.handle === p.handle} /><BadgeWall badges={p.badges} /></div>
    <Wall handle={p.handle} />
    <p className="mini comp">A free prediction game for fun. Not betting. No money in, no money out.</p>
  </>;
}
