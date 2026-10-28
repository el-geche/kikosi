// Database side of favourite clubs and fantasy squads. Players are checked against the cached football-data squads,
// so only real players at real clubs can be saved.
import { db } from "./db.js";
import { LEAGUES } from "./data.js";
import { competitionTeams, competitionScorers, findTeam } from "./fdStore.js";
import { validateSquad, analyseSquad, SQUAD_SIZE } from "./fantasy.js";

export async function setFavTeam(memberId, teamId) {
  if (teamId === null) { await db()`update members set fav_team_id = null where id = ${memberId}`; return { ok: true, team: null }; }
  const t = await findTeam(teamId);
  if (!t) return { ok: false, error: "Unknown club." };
  await db()`update members set fav_team_id = ${teamId} where id = ${memberId}`;
  return { ok: true, team: { id: t.id, name: t.name, short: t.short, crest: t.crest, league: t.league } };
}
export async function favTeam(teamId) {
  if (!teamId) return null;
  try { const t = await findTeam(teamId); return t ? { id: t.id, name: t.name, short: t.short, crest: t.crest, league: t.league } : null; } catch { return null; }
}
export async function getSquad(memberId) {
  const s = (await db()`select id, name, updated_at from fantasy_squads where member_id = ${memberId}`)[0];
  if (!s) return { name: "My XII", players: [] };
  const players = await db()`select player_id, team_id, competition, name, position, slot, x, y from fantasy_players where squad_id = ${s.id} order by slot`;
  // Club name + crest from the cached squads (24 h); missing cache just leaves them blank.
  const comps = [...new Set(players.map((p) => p.competition))], teams = {};
  for (const c of comps) { try { for (const t of (await competitionTeams(c)).body) teams[t.id] = t; } catch {} }
  return { name: s.name, updatedAt: s.updated_at,
    players: players.map((p) => ({ ...p, x: Number(p.x), y: Number(p.y), team: teams[p.team_id]?.short || "", crest: teams[p.team_id]?.crest || null })) };
}
/** Validates and resolves every player against the cached squads (club, position, crest come from the data, not the client). */
export async function saveSquad(memberId, name, input) {
  if (!Array.isArray(input) || input.length > SQUAD_SIZE) return { ok: false, errors: [`A squad has at most ${SQUAD_SIZE} players.`] };
  const comps = [...new Set(input.map((p) => p.competition))];
  if (comps.some((c) => !LEAGUES.some((l) => l.fd === c))) return { ok: false, errors: ["Unknown league."] };
  const teams = Object.fromEntries(await Promise.all(comps.map(async (c) => [c, (await competitionTeams(c)).body])));
  const players = [];
  for (const p of input) {
    const team = teams[p.competition].find((t) => t.id === Number(p.team_id));
    const pl = team?.squad.find((x) => x.id === Number(p.player_id));
    if (!pl) return { ok: false, errors: [`Player ${String(p.name || p.player_id).slice(0, 40)} isn't in that club's squad.`] };
    players.push({ player_id: pl.id, team_id: team.id, team: team.short, competition: p.competition, name: pl.name, position: pl.position,
      slot: Number(p.slot), x: Math.round(Number(p.x) * 10) / 10, y: Math.round(Number(p.y) * 10) / 10 });
  }
  const v = validateSquad(players);
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };
  const nm = String(name || "My XII").replace(/\s+/g, " ").trim().slice(0, 30) || "My XII";
  const sql = db();
  const sq = (await sql`insert into fantasy_squads (member_id, name) values (${memberId}, ${nm})
    on conflict (member_id) do update set name = excluded.name, updated_at = now() returning id`)[0];
  const col = (f) => players.map(f);
  await sql.transaction([
    sql`delete from fantasy_players where squad_id = ${sq.id}`,
    sql`insert into fantasy_players (squad_id, player_id, team_id, competition, name, position, slot, x, y)
      select ${sq.id}, * from unnest(${col((p) => p.player_id)}::int[], ${col((p) => p.team_id)}::int[], ${col((p) => p.competition)}::text[],
        ${col((p) => p.name)}::text[], ${col((p) => p.position)}::text[], ${col((p) => p.slot)}::smallint[], ${col((p) => p.x)}::real[], ${col((p) => p.y)}::real[])`,
  ]);
  return { ok: true, warnings: v.warnings, players };
}

/** Real-data analysis: club ratings/standings from the model, goals/assists from top-scorer lists (where present). */
export async function squadAnalysis(players) {
  const { getOne } = await import("./all.js");
  const comps = [...new Set(players.map((p) => p.competition))];
  const notes = [];
  const clubs = {}, scorers = {}, leaders = [];
  for (const l of LEAGUES) {
    let d = null;
    try { d = await getOne(l.slug); } catch { notes.push(`${l.name}: fixtures unavailable right now.`); continue; }
    const top = d.standings[0]; if (top && d.teams[top.name]) leaders.push({ league: l.fd, short: top.short, ...d.teams[top.name] });
    if (!comps.includes(l.fd)) continue;
    let teams = [];
    try { teams = (await competitionTeams(l.fd)).body; } catch { notes.push(`${l.name}: club list unavailable.`); }
    for (const t of teams) { const r = d.teams[t.name]; if (r) clubs[t.id] = { ...r, league: l.fd, crest: t.crest }; }
    try { const s = await competitionScorers(l.fd); for (const x of s.body) scorers[x.id] = x; if (s.stale) notes.push(`${l.name}: scorers list is from ${new Date(s.fetchedAt).toISOString().slice(0, 16)} UTC (refresh pending).`); }
    catch { notes.push(`${l.name}: top-scorers list unavailable, so goals/assists are missing.`); }
  }
  const missingClub = players.filter((p) => !clubs[p.team_id]).length;
  if (missingClub) notes.push(`${missingClub} player(s) play for clubs without a model rating yet.`);
  return { ...analyseSquad(players, clubs, scorers, leaders), notes, leadersList: leaders.map((l) => ({ league: l.league, short: l.short, attack: l.attack, defence: l.defence })) };
}
