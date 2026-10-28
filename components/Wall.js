"use client";
// A member's wall: emoji reactions (one of each per reactor, toggle), short comments (newest first), and their
// predictions for matches that have kicked off. Live via the shared realtime connection; ETag refetch on events.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, localEvent } from "./useRealtime";
const EMOJI = ["🔥", "😂", "👏", "🤡", "😬", "🐐"];
const MAX = 140;
const ago = (s) => { const m = Math.round((Date.now() - Date.parse(s)) / 60e3); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }); };
const post = async (url, body, method = "POST") => { const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await r.json(); } catch {} return { ok: r.ok, status: r.status, ...j }; };

function Reacts({ group, onReact, disabled, label }) {
  return <div className="reacts" role="group" aria-label={label}>{EMOJI.map((e) => <button key={e} type="button" className={group.mine.includes(e) ? "on" : ""} aria-pressed={group.mine.includes(e)}
    disabled={disabled} onClick={() => onReact(e)} title={disabled ? "Sign in to react" : "React"}>{e}{group.counts[e] ? <b>{group.counts[e]}</b> : null}</button>)}</div>;
}

export default function Wall({ handle }) {
  const [d, setD] = useState(null), [text, setText] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const tag = useRef(null), base = `/api/members/${encodeURIComponent(handle)}`;
  const load = useCallback(async () => {
    const r = await fetch(base, { headers: tag.current ? { "If-None-Match": tag.current } : {}, cache: "no-store" });
    if (r.status === 200) { tag.current = r.headers.get("etag"); setD(await r.json()); }
  }, [base]);
  useEffect(() => { load(); }, [load]);
  useRealtime((k, data) => { if (k === "resume" || (["comment", "comment_removed", "reaction"].includes(k) && data?.target === handle) || k === "settled") load(); });
  if (!d) return <div className="card"><p className="mini">Loading wall…</p></div>;
  const signedIn = !!d.me, isMe = d.me === handle;
  const byMatch = (id) => { const rs = d.reactions.filter((r) => (r.matchId ?? null) === id);
    return { counts: Object.fromEntries(rs.map((r) => [r.emoji, r.n])), mine: rs.filter((r) => r.mine).map((r) => r.emoji) }; };
  const react = async (emoji, matchId = null) => {
    setErr(""); const r = await post(`${base}/react`, { emoji, matchId });
    if (!r.ok) return setErr(r.error || "Couldn't react.");
    localEvent(r.event);
    setD((x) => ({ ...x, reactions: [...x.reactions.filter((y) => !((y.matchId ?? null) === matchId && y.emoji === emoji)), ...(r.n ? [{ matchId, emoji, n: r.n, mine: r.on }] : [])] }));
  };
  const send = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const r = await post(`${base}/comments`, { body: text }); setBusy(false);
    if (!r.ok) return setErr(r.error || "Couldn't post.");
    localEvent(r.event); setText(""); setD((x) => ({ ...x, comments: [{ ...r.comment, mine: true }, ...x.comments.filter((c) => c.id !== r.comment.id)] }));
  };
  const act = async (c, action) => {
    if (action === "hide" && !confirm("Hide this comment for everyone?")) return;
    const r = action === "delete" ? await post(`/api/comments/${c.id}`, null, "DELETE") : await post(`/api/comments/${c.id}`, { action });
    if (!r.ok) return setErr(r.error || "Couldn't do that.");
    if (action === "report") return setErr("Thanks, reported to the moderators.");
    setD((x) => ({ ...x, comments: x.comments.filter((y) => y.id !== c.id) }));
  };
  const mute = async () => { const r = await post(`${base}/mute`, { on: !d.muted }); if (r.ok) { tag.current = null; load(); } else setErr(r.error || "Couldn't mute."); };
  return <div className="wall" data-testid="wall">
    <section className="card">
      <div className="sec-h"><h2>Banter</h2>{signedIn && !isMe && <button className="btn sm" onClick={mute}>{d.muted ? "Unmute" : "Mute"} @{handle}</button>}</div>
      {!isMe && <Reacts group={byMatch(null)} onReact={(e) => react(e)} disabled={!signedIn} label={`React to @${handle}`} />}
      {isMe && <Reacts group={byMatch(null)} onReact={() => {}} disabled label="Reactions to you" />}
      {signedIn ? <form className="cform" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX} placeholder={isMe ? "Post on your own wall" : `Say something to @${handle}`} aria-label="Comment" />
        <span className={`mini ${[...text].length > MAX - 10 ? "warn" : ""}`}>{MAX - [...text].length}</span>
        <button className="btn sm" disabled={busy || !text.trim()}>Post</button></form>
        : <p className="mini"><a href="/me">Create a free nickname</a> to react and comment.</p>}
      {err && <p className="err" role="status">{err}</p>}
      <ul className="clist">{d.comments.map((c) => <li key={c.id} data-testid="comment"><a href={`/m/${c.author}`}>@{c.author}</a> <span className="cbody">{c.body}</span>
        <span className="mini"> · {ago(c.at)}</span>
        <span className="cact">{c.mine && <button className="linkbtn" onClick={() => act(c, "delete")}>Delete</button>}
          {signedIn && !c.mine && <button className="linkbtn" onClick={() => act(c, "report")}>Report</button>}
          {d.isAdmin && <button className="linkbtn" onClick={() => act(c, "hide")}>Hide</button>}</span></li>)}</ul>
      {!d.comments.length && <p className="mini">No comments yet.</p>}
      <p className="mini">Max {MAX} characters · no links or phone numbers · 10 comments per 10 minutes. Mute hides someone’s comments for you.</p>
    </section>
    <section className="card">
      <h2>Predictions</h2>
      <p className="mini">Only matches that have kicked off are shown. Upcoming picks stay private.</p>
      {d.predictions.length ? <ul className="plist">{d.predictions.map((p) => <li key={p.matchId}>
        <span>{p.home} – {p.away}</span><span className="mini">pick <b>{p.pick.replace("-", "–")}</b>{p.result ? ` · FT ${p.result.replace("-", "–")}` : " · in play"}</span>
        {p.voided ? <span className="pts void">void</span> : p.points != null ? <span className={`pts p${p.points}`}>{p.points} pt{p.points === 1 ? "" : "s"}</span> : <span className="pts">…</span>}
        {p.settled && !p.voided && !isMe && <Reacts group={byMatch(p.matchId)} onReact={(e) => react(e, p.matchId)} disabled={!signedIn} label="React to this prediction" />}
      </li>)}</ul> : <p className="mini">Nothing to show yet.</p>}
    </section>
  </div>;
}
