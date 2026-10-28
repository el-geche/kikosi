"use client";
import { useState } from "react";
const COMPLIANCE = "A free prediction game for fun. Not betting. No money in, no money out.";
const post = async (url, body) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  let j = {}; try { j = await r.json(); } catch {}
  return { ok: r.ok, status: r.status, ...j };
};
const since = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" }) : "");

export default function MemberPanel({ initial, available }) {
  const [member, setMember] = useState(initial);
  const [code, setCode] = useState(null); // shown once, right after creating the account
  const [saved, setSaved] = useState(false);
  if (!available) return <div className="card"><p className="mini" style={{ margin: 0 }}>Accounts aren’t switched on for this deployment yet.</p></div>;
  if (member && code) return <div className="card acct" data-testid="recovery">
    <h2>Save your recovery code</h2>
    <p>You’re signed in as <b>@{member.handle}</b>. This code is the only way to get your account back on another device or after signing out. <b>It is shown only once</b> and we can’t recover it for you.</p>
    <div className="code-box" data-testid="recovery-code">{code}</div>
    <div className="row"><button className="btn" type="button" onClick={() => navigator.clipboard?.writeText(code)}>Copy code</button></div>
    <label className="check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I’ve saved my recovery code somewhere safe</label>
    <button className="btn primary" type="button" disabled={!saved} onClick={() => setCode(null)}>Continue</button>
  </div>;
  if (member) return <div className="card acct" data-testid="signed-in">
    <h2>@{member.handle}</h2>
    <p className="mini">Member since {since(member.createdAt)}. Predictions and leaderboards are coming next.</p>
    <p className="mini">Signing out on this device keeps your account. To sign back in you’ll need your handle and recovery code.</p>
    <SignOut onDone={() => setMember(null)} />
    <p className="mini comp">{COMPLIANCE}</p>
  </div>;
  return <div className="layout2">
    <Create onDone={(m, c) => { setMember(m); setCode(c); }} />
    <Restore onDone={(m) => setMember(m)} />
  </div>;
}

function Create({ onDone }) {
  const [handle, setHandle] = useState(""), [adult, setAdult] = useState(false), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const r = await post("/api/member", { handle, confirm18: adult }); setBusy(false);
    if (r.ok) onDone(r.member, r.recoveryCode); else setErr(r.error || "Something went wrong. Try again.");
  };
  return <form className="card acct" onSubmit={submit} data-testid="create">
    <h2>Create an account</h2>
    <label className="fld">Nickname<input name="handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g. gor_mahia_fan" minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" autoComplete="nickname" required /></label>
    <p className="mini">3–20 letters, numbers or underscores. Shown on leaderboards, so don’t use your real name if you’d rather not.</p>
    <label className="check"><input type="checkbox" name="confirm18" checked={adult} onChange={(e) => setAdult(e.target.checked)} required /> I confirm I am 18 or older</label>
    {err && <p className="err" role="alert">{err}</p>}
    <button className="btn primary" disabled={busy || !adult}>{busy ? "Creating…" : "Create account"}</button>
    <p className="mini comp">{COMPLIANCE}</p>
  </form>;
}

function Restore({ onDone }) {
  const [handle, setHandle] = useState(""), [code, setCode] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    const r = await post("/api/member/restore", { handle, code }); setBusy(false);
    if (r.ok) { const me = await fetch("/api/member", { cache: "no-store" }).then((x) => x.json()).catch(() => ({})); onDone(me.member || r.member); }
    else setErr(r.error || "Something went wrong. Try again.");
  };
  return <form className="card acct" onSubmit={submit} data-testid="restore">
    <h2>Restore account</h2>
    <p className="mini">Already have a Kikosi nickname? Enter it with your recovery code to sign in on this device.</p>
    <label className="fld">Nickname<input name="handle" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={20} autoComplete="username" required /></label>
    <label className="fld">Recovery code<input name="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} required /></label>
    {err && <p className="err" role="alert">{err}</p>}
    <button className="btn" disabled={busy}>{busy ? "Checking…" : "Restore account"}</button>
  </form>;
}

function SignOut({ onDone }) {
  const [busy, setBusy] = useState(false);
  return <button className="btn" type="button" disabled={busy} onClick={async () => { setBusy(true); await post("/api/member/logout"); setBusy(false); onDone(); }}>Sign out</button>;
}
