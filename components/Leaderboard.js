"use client";
// Weekly (Mon–Sun EAT) / all-time leaderboard. Cheap refetch: ETag/304 + CDN-cached API, refresh on "settled" events.
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import RankIcon, { Flame } from "./RankIcon";
import { useRealtime } from "./useRealtime";
import { whoAmI } from "./MembersList";

export default function Leaderboard({ initialPeriod = "week" }) {
  const [period, setPeriod] = useState(initialPeriod), [d, setD] = useState(null), [me, setMe] = useState(null);
  const tags = useRef({});
  useEffect(() => { whoAmI().then(setMe); }, []);
  const load = useCallback(async (p) => {
    const c = tags.current[p];
    const r = await fetch(`/api/leaderboard?period=${p}`, { headers: c ? { "If-None-Match": c.tag } : {} });
    if (r.status === 304 && c) return setD(c.body);
    if (r.status === 200) { const j = await r.json(); tags.current[p] = { tag: r.headers.get("etag"), body: j }; setD((x) => (j.period === p ? j : x)); }
  }, []);
  useEffect(() => { load(period); const t = setInterval(() => !document.hidden && load(period), 60e3); return () => clearInterval(t); }, [period, load]);
  useRealtime((k) => { if (k === "settled" || k === "resume") load(period); });
  const fmt = (s) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
  const rows = d && d.period === period ? d.rows : null;
  return <div className="card" data-testid="leaderboard">
    <div className="tabs" role="tablist">{[["week", "This week"], ["all", "All-time"]].map(([k, l]) =>
      <button key={k} role="tab" aria-selected={period === k} className={period === k ? "on" : ""} onClick={() => setPeriod(k)}>{l}</button>)}</div>
    {period === "week" && d?.week && <p className="mini">Week {fmt(d.week.start)} – {fmt(Date.parse(d.week.end) - 1)} (Mon–Sun, EAT).</p>}
    <p className="mini">Ties: more exact scores, then more correct outcomes, then whoever reached the total first.</p>
    {!rows ? <p className="mini">Loading…</p> : !rows.length ? <p className="mini">No ranked members yet. You need at least {d.minSettled ?? 5} settled predictions to appear.</p> :
    <div className="scroll"><table className="lb"><thead><tr><th>#</th><th>Member</th><th className="n">Pts</th><th className="n" title="Exact scores">Exact</th><th className="n" title="Correct outcomes (incl. exact)">Outcome</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.handle} className={r.handle === me ? "you" : ""}>
        <td>{r.rank}</td>
        <td><span className="lb-m"><RankIcon tier={r.tier} size={18} /><Link href={`/m/${r.handle}`}>@{r.handle}</Link>{r.handle === me && <em className="mini"> you</em>}<Flame n={r.streak} /></span></td>
        <td className="n"><b>{r.points}</b></td><td className="n">{r.exact}</td><td className="n">{r.outcomes}</td></tr>)}</tbody></table></div>}
    <p className="mini comp">Minimum {d?.minSettled ?? 5} settled predictions to be ranked. A free prediction game for fun. Not betting. No money in, no money out.</p>
  </div>;
}
