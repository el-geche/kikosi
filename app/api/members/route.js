// Read-only members panel: ?q=&sort=points|streak|weekly&page=1. Public fields only (lib/social.js whitelist).
// Same response for everyone (no "you" flag), so the CDN can cache it for ~8 s; rate-limited per IP on cache misses.
import { configured } from "../../../lib/api.js";
import { membersList } from "../../../lib/socialStore.js";
import { etagJson, rateLimited, clientIpOf } from "../../../lib/http.js";
export const dynamic = "force-dynamic";
export async function GET(req) {
  if (!configured()) return etagJson(req, { rows: [], total: 0, available: false });
  if (rateLimited(`members:${clientIpOf(req)}`, 60, 60e3)) return Response.json({ error: "Slow down a little." }, { status: 429, headers: { "Retry-After": "30" } });
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") || "").slice(0, 20).replace(/[^A-Za-z0-9_]/g, "");
  const list = await membersList({ q, sort: sp.get("sort") || "points", page: Math.min(200, Number(sp.get("page")) || 1) });
  return etagJson(req, { ...list, q, available: true }, { cdn: 8 });
}
