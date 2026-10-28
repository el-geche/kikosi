// Members panel + banter rules: public field whitelist, pre-kickoff privacy, comment filter, reactions.
// Pure functions so they can be unit-tested.
import { rankFor } from "./ranks.js";

export const REACTIONS = ["🔥", "😂", "👏", "🤡", "😬", "🐐"];
export const COMMENT_MAX = 140;
export const COMMENT_LIMIT = { max: 10, windowMs: 10 * 60e3 };
export const MEMBERS_PAGE_SIZE = 25;

/** The ONLY member fields that leave the server in public APIs. No ids, hashes, IPs, picks or timestamps of sign-up. */
export const PUBLIC_MEMBER_FIELDS = ["handle", "tier", "tierName", "points", "streak", "bestStreak", "weekly", "badges"];
export function publicMember(row) {
  const r = rankFor(row.points);
  const out = { handle: String(row.handle), tier: r.tier.id, tierName: r.tier.name, points: Number(row.points) || 0,
    streak: Number(row.current_streak ?? row.streak) || 0, bestStreak: Number(row.best_streak ?? row.bestStreak) || 0,
    weekly: Number(row.weekly) || 0, badges: Number(row.badge_count ?? row.badges) || 0 };
  return Object.fromEntries(PUBLIC_MEMBER_FIELDS.map((k) => [k, out[k]]));
}

/**
 * Another member's predictions may be shown only once the match has kicked off (or it is no longer open).
 * Returns only safe fields; the pick is withheld for anything still before kickoff.
 */
export function publicPredictions(preds, now = Date.now()) {
  return preds.filter((p) => Date.parse(p.kickoff_utc) <= now).map((p) => ({
    matchId: p.match_id, home: p.home_short, away: p.away_short, competition: p.competition,
    kickoff: new Date(p.kickoff_utc).toISOString(), pick: `${p.home_goals}-${p.away_goals}`,
    result: p.ft_home != null ? `${p.ft_home}-${p.ft_away}` : null, points: p.voided ? null : p.points ?? null, voided: !!p.voided }));
}
/** Reacting to a prediction is allowed only when it is settled (so it is already after kickoff). */
export const canReactToPrediction = (pred, now = Date.now()) => !!pred && pred.settled_at != null && !pred.voided && Date.parse(pred.kickoff_utc) <= now;

// ---- Comment filter: block slurs, hard profanity, links and phone numbers; allow mild trash talk ----
const SLURS = ["nigg", "faggot", "fagot", "retard", "tranny", "kike", "spic", "chink", "msenge", "shoga", "malaya", "kumamako", "mbwa wewe"];
const HARD = ["fuck", "fvck", "phuck", "cunt", "motherf", "whore", "slut", "pussy", "dickhead", "rape"];
const fold = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
  .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/@/g, "a").replace(/\$/g, "s");
const squash = (s) => fold(s).replace(/[^a-z ]/g, "");
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\s*(\.|\(dot\)|\[dot\])\s*(com|ke|net|org|io|co|app|ly|me|tv|xyz|link|info|biz|gg|to|site|online|bet)\b|t\.me\/|wa\.me\/)/i;
const PHONE = /(\+?\d[\d\s-]{8,}\d)/;

/** { ok: true, body } (trimmed, whitespace collapsed) or { ok: false, error }. */
export function validateComment(input) {
  const body = typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
  if (!body) return { ok: false, error: "Write something first." };
  if ([...body].length > COMMENT_MAX) return { ok: false, error: `Keep it to ${COMMENT_MAX} characters.` };
  if (LINK.test(body)) return { ok: false, error: "Links aren't allowed in comments." };
  if (PHONE.test(body)) return { ok: false, error: "Phone numbers aren't allowed in comments." };
  const s = squash(body), joined = s.replace(/ /g, "");
  if (SLURS.some((w) => s.includes(w) || joined.includes(w.replace(/ /g, "")))) return { ok: false, error: "That language isn't allowed here." };
  if (HARD.some((w) => joined.includes(w))) return { ok: false, error: "Keep the banter clean, please." };
  return { ok: true, body };
}
export const commentAllowed = (recentCount) => recentCount < COMMENT_LIMIT.max;

/**
 * Toggle a reaction: adds it if absent, removes it if present. store: { has(key), add(key), remove(key) }.
 * Calling with the same desired state is idempotent via `want` ("on" | "off" | undefined for toggle).
 */
export async function toggleReaction(store, { reactor, target, matchId = null, emoji }, want) {
  if (!REACTIONS.includes(emoji)) return { ok: false, error: "Unknown reaction." };
  if (reactor === target) return { ok: false, error: "You can't react to yourself." };
  const key = { reactor, target, matchId, emoji };
  const has = await store.has(key);
  const on = want === "on" ? true : want === "off" ? false : !has;
  if (on && !has) await store.add(key);
  if (!on && has) await store.remove(key);
  return { ok: true, on };
}

/** Comma-separated ADMIN_HANDLES env var -> lower-cased set. */
export const adminHandles = (env = process.env.ADMIN_HANDLES) => new Set(String(env || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
