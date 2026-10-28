import Link from "next/link";
import { listRecaps } from "../../lib/socialStore.js";
export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly recaps · Kikosi" };
export default async function Recaps() {
  const rows = process.env.DATABASE_URL ? await listRecaps().catch(() => []) : [];
  return <>
    <div className="hero"><h1>Weekly <span className="grad">recaps</span></h1><p>Generated automatically once a week (Mon–Sun, EAT) is settled: most-reacted members, top banter, the boldest exact calls, the longest streaks and the biggest climbers.</p></div>
    <div className="card">{rows.length ? <ul className="plist">{rows.map((r) => <li key={r.week}><Link href={`/recap/${r.week}`}>{r.title}</Link></li>)}</ul> : <p className="mini">No recaps yet. The first one appears after the first full week is settled.</p>}</div>
  </>;
}
