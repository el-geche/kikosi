"use client";
// Read-only members panel (public fields only). Desktop: side panel. Mobile: floating button + bottom sheet.
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import RankIcon, { Flame } from "./RankIcon";
let mePromise = null;
/** Your handle (or null), fetched once per page from the private /api/member endpoint. */
export function whoAmI() {
  if (!mePromise) mePromise = fetch("/api/member", { cache: "no-store" }).then((r) => r.json()).then((j) => j.member?.handle || null).catch(() => null);
  return mePromise;
}
function Panel() {
  const [q, setQ] = useState(""), [sort, setSort] = useState("points"), [page, setPage] = useState(1), [d, setD] = useState(null), [me, setMe] = useState(null), [err, setErr] = useState("");
  const tags = useRef({});
  useEffect(() => { whoAmI().then(setMe); }, []);
  useEffect(() => { let on = true; const t = setTimeout(async () => {
    const url = `/api/members?q=${encodeURIComponent(q)}&sort=${sort}&page=${page}`;
    try { const r = await fetch(url, { headers: tags.current[url] ? { "If-None-Match": tags.current[url].tag } : {} });
      if (!on) return; if (r.status === 304) return setD(tags.current[url].body);
      const j = await r.json(); if (!r.ok) return setErr(j.error || "Members unavailable."); tags.current[url] = { tag: r.headers.get("etag"), body: j }; setErr(""); setD(j);
    } catch { on && setErr("Members unavailable."); } }, q ? 250 : 0); return () => { on = false; clearTimeout(t); }; }, [q, sort, page]);
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  return <div className="mpanel" data-testid="members-panel">
    <div className="mp-h"><h3>Members</h3><span className="mini">{d?.total ?? "…"}</span></div>
    <input className="mp-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search nickname" aria-label="Search members" maxLength={20} />
    <div className="tabs small" role="tablist">{[["points", "Points"], ["weekly", "This week"], ["streak", "Streak"]].map(([k, l]) =>
      <button key={k} role="tab" aria-selected={sort === k} className={sort === k ? "on" : ""} onClick={() => { setSort(k); setPage(1); }}>{l}</button>)}</div>
    {err && <p className="err">{err}</p>}
    <ol className="mp-list" start={(page - 1) * (d?.pageSize || 25) + 1}>{(d?.rows || []).map((r) => <li key={r.handle} className={r.handle === me ? "you" : ""}>
      <Link href={`/m/${r.handle}`}><RankIcon tier={r.tier} size={20} /><span className="mp-n">@{r.handle}{r.handle === me && <em> you</em>}</span>
        <Flame n={r.streak} /><span className="mp-p" title="All-time points">{r.points}</span><span className="mp-w" title="Points this week">+{r.weekly}</span></Link></li>)}</ol>
    {d && !d.rows.length && <p className="mini">No members found.</p>}
    {pages > 1 && <div className="mp-pg"><button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</button><span className="mini">{page}/{pages}</span><button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next ›</button></div>}
    <p className="mini">Picks stay hidden until kick-off.</p>
  </div>;
}
export default function MembersList({ mode = "side" }) {
  const [open, setOpen] = useState(false);
  if (mode === "side") return <aside className="mside card"><Panel /></aside>;
  return <>
    <button className="mp-fab" onClick={() => setOpen(true)} aria-haspopup="dialog">👥 Members</button>
    {open && <div className="sheet-bg" onClick={() => setOpen(false)}><div className="sheet" role="dialog" aria-modal="true" aria-label="Members" onClick={(e) => e.stopPropagation()}>
      <button className="sheet-x" onClick={() => setOpen(false)} aria-label="Close">✕</button><Panel /></div></div>}
  </>;
}
