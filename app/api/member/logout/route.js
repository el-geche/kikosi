// POST: sign out on this device (clears the session cookie; the account stays and can be restored with the code).
import { json, badRequestOrigin, clearSession } from "../../../../lib/api.js";
export const dynamic = "force-dynamic";
export async function POST(req) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  return clearSession(json({ ok: true }));
}
