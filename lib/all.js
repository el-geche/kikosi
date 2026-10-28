import { LEAGUES, getLeagueData } from "./data.js";
import { analyseLeague } from "./model.js";
export async function getAll() {
  return Promise.all(LEAGUES.map(async (l) => { try { return { league: l, ...analyseLeague(await getLeagueData(l)) }; } catch (e) { return { league: l, error: e.message, upcoming: [], live: [], history: [], pending: [], off: [], standings: [], recent: [] }; } }));
}
export async function getOne(slug) { const l = LEAGUES.find((x) => x.slug === slug); if (!l) return null; return { league: l, ...analyseLeague(await getLeagueData(l)) }; }
