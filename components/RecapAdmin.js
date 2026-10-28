"use client";
// Pin/unpin toggle on a recap item, shown to ADMIN_HANDLES only (the API re-checks).
import { useState } from "react";
export default function PinToggle({ week, kind, refId, pinned }) {
  const [on, setOn] = useState(pinned), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const flip = async () => { setBusy(true); setErr("");
    const r = await fetch(`/api/recap/${week}/pins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ref: refId, pinned: !on }) });
    setBusy(false); if (r.ok) setOn(!on); else setErr((await r.json().catch(() => ({}))).error || "Failed"); };
  return <span className="pin-t"><button className="linkbtn" disabled={busy} onClick={flip}>{on ? "📌 Unpin" : "Pin"}</button>{err && <span className="err"> {err}</span>}</span>;
}
