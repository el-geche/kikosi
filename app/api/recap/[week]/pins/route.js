// Admin only (ADMIN_HANDLES): POST { kind, ref, pinned } to pin/unpin an item on the recap for week YYYY-MM-DD (Monday, EAT).
import { json, badRequestOrigin, readJson, configured } from "../../../../../lib/api.js";
import { currentMember } from "../../../../../lib/memberStore.js";
import { adminHandles } from "../../../../../lib/social.js";
import { setPin } from "../../../../../lib/socialStore.js";
import { weekFromKey } from "../../../../../lib/live.js";
export const dynamic = "force-dynamic";
const KINDS = new Set(["reaction", "comment", "exact", "streak", "mover"]);
export async function POST(req, { params }) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  if (!configured()) return json({ error: "Not available." }, 503);
  const me = await currentMember(); if (!me || !adminHandles().has(me.handle.toLowerCase())) return json({ error: "Admins only." }, 403);
  const w = weekFromKey(params.week); if (w == null) return json({ error: "Unknown week." }, 404);
  const b = await readJson(req);
  if (!KINDS.has(b.kind) || typeof b.ref !== "string" || b.ref.length > 80) return json({ error: "Bad pin." }, 400);
  const r = await setPin(w, b.kind, b.ref, b.pinned !== false);
  return json(r, r.ok ? 200 : 404);
}
