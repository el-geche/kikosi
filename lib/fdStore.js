// football-data.org extras for favourite clubs and fantasy squads, cached centrally in Neon (fd_cache) so the free tier
// is never hit per visitor. Every upstream call goes through the shared scheduler budget (lib/fdScheduler.js).
//  - /v4/competitions/{code}/teams   clubs + full squads with positions   24 h
//  - /v4/competitions/{code}/scorers goals, assists, matches played      1 h
// Stale copies are served when the budget is busy or the API errors (marked stale).
import { LEAGUES } from "./data.js";
import { fdCall, cacheGet, cachePut } from "./fdScheduler.js";

export const TTL = { teams: 24 * 3600e3, scorers: 3600e3 };
const CODES = new Set(LEAGUES.map((l) => l.fd));
const inflight = new Map();

/** Generic cache-or-fetch with stale fallback. store/fetcher are injectable for tests. */
export async function cached(key, ttlMs, load, { now = Date.now(), get = cacheGet, put = cachePut } = {}) {
  const hit = await get(key);
  if (hit && now - hit.fetchedAt < ttlMs) return { body: hit.body, fetchedAt: hit.fetchedAt, stale: false };
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try { const body = await load(); await put(key, body, now); return { body, fetchedAt: now, stale: false }; }
    catch (e) { if (hit) return { body: hit.body, fetchedAt: hit.fetchedAt, stale: true, error: e.message }; throw e; }
    finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}
export function trimTeams(j) {
  return (j.teams || []).map((t) => ({ id: t.id, name: t.name, short: t.shortName || t.name, tla: t.tla, crest: t.crest,
    squad: (t.squad || []).filter((p) => Number.isInteger(p.id)).map((p) => ({ id: p.id, name: p.name, position: p.position || null, nationality: p.nationality || null })) }));
}
export function trimScorers(j) {
  return (j.scorers || []).filter((s) => s.player?.id).map((s) => ({ id: s.player.id, name: s.player.name, teamId: s.team?.id,
    goals: s.goals ?? 0, assists: s.assists ?? null, played: s.playedMatches ?? null }));
}
async function withRetry(job, path) {
  for (let i = 0; ; i++) {
    try { return await fdCall(job, path); }
    catch (e) { if (i < 2 && (e.busy === "budget" || e.busy === "leased")) { await new Promise((r) => setTimeout(r, 3000)); continue; } throw e; }
  }
}
export async function competitionTeams(code) {
  if (!CODES.has(code)) throw new Error("Unknown competition");
  return cached(`teams:${code}:2026`, TTL.teams, async () => trimTeams(await withRetry(`teams:${code}`, `/v4/competitions/${code}/teams?season=2026`)));
}
export async function competitionScorers(code) {
  if (!CODES.has(code)) throw new Error("Unknown competition");
  return cached(`scorers:${code}:2026`, TTL.scorers, async () => trimScorers(await withRetry(`scorers:${code}`, `/v4/competitions/${code}/scorers?season=2026&limit=100`)));
}
/** Finds a club in the cached competitions. */
export async function findTeam(teamId) {
  for (const l of LEAGUES) {
    const t = (await competitionTeams(l.fd)).body.find((x) => x.id === teamId);
    if (t) return { ...t, competition: l.fd, league: l.name };
  }
  return null;
}
