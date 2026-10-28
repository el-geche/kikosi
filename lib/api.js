// Small helpers shared by the /api/member routes.
import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, signSession } from "./members.js";

export const json = (body, status = 200, extra = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });

/** Blocks cross-site form posts: JSON body required, and Origin (when sent) must match this host. */
export function badRequestOrigin(req) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Send JSON." }, 415);
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    try { if (new URL(origin).host !== host) return json({ error: "Cross-site request blocked." }, 403); }
    catch { return json({ error: "Cross-site request blocked." }, 403); }
  }
  return null;
}
export async function readJson(req) { try { return await req.json(); } catch { return {}; } }

const secure = () => process.env.NODE_ENV === "production";
export function setSession(res, memberId) { res.cookies.set(COOKIE, signSession(memberId, process.env.SESSION_SECRET), cookieOptions(secure())); return res; }
export function clearSession(res) { res.cookies.set(COOKIE, "", { ...cookieOptions(secure()), maxAge: 0 }); return res; }
export const configured = () => !!process.env.DATABASE_URL && (process.env.SESSION_SECRET || "").length >= 32;
