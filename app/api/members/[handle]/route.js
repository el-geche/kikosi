// A member's public wall: comments, reaction counts and their predictions for matches that have kicked off only.
// Personalised (your reactions, mutes), so never CDN-cached; ETag/304 keeps polling cheap.
import { configured, json } from "../../../../lib/api.js";
import { currentMember } from "../../../../lib/memberStore.js";
import { wall } from "../../../../lib/socialStore.js";
import { profile } from "../../../../lib/gameStore.js";
import { publicMember, adminHandles } from "../../../../lib/social.js";
import { etagJson } from "../../../../lib/http.js";
export const dynamic = "force-dynamic";
export async function GET(req, { params }) {
  if (!configured()) return json({ error: "Not available." }, 503);
  const me = await currentMember();
  const handle = decodeURIComponent(params.handle).slice(0, 20);
  const [w, p] = await Promise.all([wall(handle, me?.id || null), profile(handle)]);
  if (!w || !p) return json({ error: "No such member." }, 404);
  return etagJson(req, { member: publicMember({ ...p, badge_count: p.badges.filter((b) => b.awarded_at).length }), ...w, me: me?.handle || null, isAdmin: !!me && adminHandles().has(me.handle.toLowerCase()) });
}
