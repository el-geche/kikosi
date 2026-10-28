// Fantasy squad of 12 real players: validation and analysis against real club data. Pure functions (unit-tested).
// Player ratings are NOT invented: everything is derived from each player's club (model ratings, standings, form)
// and, where available, the football-data top-scorers list (goals, assists, matches played).

export const SQUAD_SIZE = 12;
export const MAX_PER_CLUB = 3;
export const LINES = ["Goalkeeper", "Defence", "Midfield", "Offence"];
export const lineOf = (pos) => (LINES.includes(pos) ? pos : /keeper/i.test(pos || "") ? "Goalkeeper" : /back|defen/i.test(pos || "") ? "Defence"
  : /midfield/i.test(pos || "") ? "Midfield" : /forward|wing|striker|offen/i.test(pos || "") ? "Offence" : "Unknown");

/** Hard errors block saving; warnings are shown but allowed. */
export function validateSquad(players) {
  const errors = [], warnings = [];
  if (!Array.isArray(players)) return { ok: false, errors: ["Squad must be a list of players."], warnings };
  if (players.length > SQUAD_SIZE) errors.push(`A squad has at most ${SQUAD_SIZE} players.`);
  const ids = new Set(), slots = new Set();
  for (const p of players) {
    if (!Number.isInteger(p.player_id) || !Number.isInteger(p.team_id)) { errors.push("Every player needs a real player and club id."); break; }
    if (ids.has(p.player_id)) errors.push(`${p.name || p.player_id} is picked twice.`); ids.add(p.player_id);
    if (!Number.isInteger(p.slot) || p.slot < 0 || p.slot >= SQUAD_SIZE || slots.has(p.slot)) errors.push("Each player needs their own slot (0–11).");
    slots.add(p.slot);
    if (!(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)) errors.push("Pitch positions must be within the pitch.");
  }
  if (players.length < SQUAD_SIZE) warnings.push(`${players.length}/${SQUAD_SIZE} players picked.`);
  const gk = players.filter((p) => lineOf(p.position) === "Goalkeeper").length;
  if (players.length && gk === 0) warnings.push("No goalkeeper yet: pick at least 1.");
  if (gk > 2) warnings.push(`${gk} goalkeepers: most squads carry 1–2.`);
  const perClub = {}; for (const p of players) perClub[p.team_id] = (perClub[p.team_id] || 0) + 1;
  for (const [t, n] of Object.entries(perClub)) if (n > MAX_PER_CLUB) {
    const nm = players.find((p) => String(p.team_id) === t)?.team || `club ${t}`;
    warnings.push(`${n} players from ${nm} (suggested max ${MAX_PER_CLUB}).`);
  }
  const unknown = players.filter((p) => lineOf(p.position) === "Unknown").length;
  if (unknown) warnings.push(`${unknown} player(s) have no position in the data.`);
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings };
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
/**
 * players: [{ player_id, team_id, team, competition, name, position }]
 * clubs: { [team_id]: { short, league, pos, form, ppg5, attack, defence } }  (from lib/model.js; may be missing)
 * scorers: { [player_id]: { goals, assists, played } } (top-scorers lists; most players are not in them)
 * leaders: [{ league, short, attack, defence }] current league leaders
 */
export function analyseSquad(players, clubs, scorers, leaders) {
  const lines = Object.fromEntries([...LINES, "Unknown"].map((l) => [l, 0]));
  for (const p of players) lines[lineOf(p.position)]++;
  const leagues = {}, clubCount = {};
  for (const p of players) { leagues[p.competition] = (leagues[p.competition] || 0) + 1; clubCount[p.team_id] = (clubCount[p.team_id] || 0) + 1; }
  const rated = players.filter((p) => clubs[p.team_id]);
  const att = mean(rated.map((p) => clubs[p.team_id].attack)), def = mean(rated.map((p) => clubs[p.team_id].defence));
  const ppg5 = mean(rated.map((p) => clubs[p.team_id].ppg5));
  const lAtt = mean(leaders.map((l) => l.attack)), lDef = mean(leaders.map((l) => l.defence));
  // Line index: higher is better. GK/DEF use defence (inverted), MID the mean of attack and inverted defence, ATT attack.
  const idx = (p) => { const c = clubs[p.team_id]; if (!c) return null; const l = lineOf(p.position);
    return l === "Offence" ? c.attack : l === "Midfield" ? (c.attack + 1 / c.defence) / 2 : l === "Unknown" ? null : 1 / c.defence; };
  const lineScores = LINES.map((l) => ({ line: l, n: lines[l], index: mean(players.filter((p) => lineOf(p.position) === l).map(idx).filter((x) => x != null)) }))
    .filter((x) => x.index != null);
  const sorted = [...lineScores].sort((a, b) => b.index - a.index);
  let goals = 0, assists = 0, withData = 0;
  const perPlayer = players.map((p) => { const s = scorers[p.player_id]; if (s) { withData++; goals += s.goals || 0; assists += s.assists || 0; }
    const c = clubs[p.team_id];
    return { ...p, club: c ? { short: c.short, pos: c.pos, form: c.form, attack: c.attack, defence: c.defence } : null, scoring: s || null }; });
  return {
    size: players.length, lines, leagues, clubs: Object.keys(clubCount).length, maxFromOneClub: Math.max(0, ...Object.values(clubCount)),
    ratedPlayers: rated.length, avgClubAttack: att, avgClubDefence: def, avgClubPpg5: ppg5,
    leaders: { attack: lAtt, defence: lDef, attackGap: att != null && lAtt != null ? att - lAtt : null, defenceGap: def != null && lDef != null ? def - lDef : null },
    strongestLine: sorted[0] || null, weakestLine: sorted.length > 1 ? sorted[sorted.length - 1] : null, lineScores,
    scoring: { goals, assists, playersWithData: withData, missing: players.length - withData },
    perPlayer,
  };
}
