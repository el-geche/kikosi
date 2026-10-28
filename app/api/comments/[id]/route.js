// DELETE -> author (or admin) deletes a comment. POST { action: "report" | "hide" } -> report (anyone), hide (ADMIN_HANDLES only).
import { json, badRequestOrigin, readJson, configured } from "../../../../lib/api.js";
import { currentMember } from "../../../../lib/memberStore.js";
import { removeComment } from "../../../../lib/socialStore.js";
export const dynamic = "force-dynamic";
async function run(req, params, action) {
  if (!configured()) return json({ error: "Not available." }, 503);
  const m = await currentMember(); if (!m) return json({ error: "Sign in first." }, 401);
  const id = Number(params.id); if (!Number.isInteger(id)) return json({ error: "Bad id." }, 400);
  const r = await removeComment(m, id, action);
  return r.ok ? json(r) : json({ error: r.error }, r.status || 400);
}
export async function DELETE(req, { params }) { const o = req.headers.get("origin"); if (o && new URL(o).host !== (req.headers.get("x-forwarded-host") || req.headers.get("host"))) return json({ error: "Cross-site request blocked." }, 403); return run(req, params, "delete"); }
export async function POST(req, { params }) {
  const bad = badRequestOrigin(req); if (bad) return bad;
  const a = (await readJson(req)).action;
  if (a !== "report" && a !== "hide") return json({ error: "Unknown action." }, 400);
  return run(req, params, a);
}
