"use client";
// Favourite club on /me: shows the crest, opens the picker to change or clear it.
import { useState } from "react";
import ClubPicker, { Crest } from "./ClubPicker";
export default function FavClub({ initial }) {
  const [club, setClub] = useState(initial), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const save = async (t) => { setBusy(true); setErr("");
    const r = await fetch("/api/me/club", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId: t ? t.id : null }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.ok) { setClub(j.team || null); setOpen(false); } else setErr(j.error || "Couldn't save."); };
  return <div className="favclub" data-testid="fav-club">
    <div className="fc-row">{club ? <><Crest src={club.crest} size={36} alt={`${club.short} crest`} /><div><b>{club.short}</b><div className="mini">{club.league}</div></div></>
      : <span className="mini">No favourite club yet.</span>}
      <button className="btn sm" onClick={() => setOpen(!open)}>{open ? "Close" : club ? "Change" : "Pick a club"}</button>
      {club && <button className="linkbtn" disabled={busy} onClick={() => save(null)}>Clear</button>}</div>
    {err && <p className="err">{err}</p>}
    {open && <ClubPicker value={club?.id} busy={busy} onPick={save} />}
  </div>;
}
