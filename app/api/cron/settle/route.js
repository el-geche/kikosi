// Daily safety-net (Vercel Hobby crons run once a day, production only). Settlement also runs lazily after every
// fixture refresh. Requires Authorization: Bearer $CRON_SECRET.
import { timingSafeEqual } from "node:crypto";
import { settle } from "../../../../lib/gameStore.js";
import { tick } from "../../../../lib/fdScheduler.js";
import { pruneEvents } from "../../../../lib/events.js";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ok = (h) => { const s = process.env.CRON_SECRET; if (!s || !h) return false; const a = Buffer.from(h), b = Buffer.from(`Bearer ${s}`); return a.length === b.length && timingSafeEqual(a, b); };
export async function GET(req) {
  if (!ok(req.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const t = await tick({ minGapMs: 0 }).catch((e) => ({ error: e.message }));
  const s = await settle();
  await pruneEvents().catch(() => {});
  return Response.json({ ok: true, tick: t, settle: s });
}
