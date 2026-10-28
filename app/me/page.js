import MemberPanel from "../../components/MemberPanel";
import { currentMember } from "../../lib/memberStore.js";
import { COMPLIANCE } from "../../lib/members.js";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your Kikosi account · Kikosi" };
export default async function Me() {
  let member = null, available = !!process.env.DATABASE_URL && !!process.env.SESSION_SECRET;
  if (available) { try { const m = await currentMember(); member = m && { handle: m.handle, createdAt: m.createdAt.toISOString?.() ?? m.createdAt }; } catch (e) { console.error("me:", e.message); available = false; } }
  return <>
    <div className="hero"><h1>Your <span className="grad">Kikosi</span> account</h1>
      <p>Pick a nickname to join the free match-prediction game. No phone number, email or password: this device remembers you, and a one-time recovery code lets you sign in on another device.</p>
      <div className="note" style={{ marginTop: 16 }}><b>{COMPLIANCE}</b> No stakes, deposits, payouts or prizes. 18+.</div></div>
    <MemberPanel initial={member} available={available} />
  </>;
}
