// Data layer: openfootball (keyless, public JSON on GitHub) with optional football-data.org if FOOTBALL_DATA_API_KEY is set.
export const LEAGUES = [
  { slug: "premier-league", name: "Premier League", country: "England", of: "en.1", fd: "PL", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { slug: "la-liga", name: "La Liga", country: "Spain", of: "es.1", fd: "PD", flag: "🇪🇸" },
  { slug: "bundesliga", name: "Bundesliga", country: "Germany", of: "de.1", fd: "BL1", flag: "🇩🇪" },
  { slug: "serie-a", name: "Serie A", country: "Italy", of: "it.1", fd: "SA", flag: "🇮🇹" },
];
const SEASON = { cur: "2026-27", prev: "2025-26", fdCur: 2026, fdPrev: 2025 };
const REVALIDATE = 3600;

export const cleanName = (n) => n.replace(/\s+(FC|AFC|CF|CFC)$/i, "").replace(/^(FC|AFC)\s+/i, "").trim();

function normOF(m) {
  let ft = null;
  if (Array.isArray(m.score)) ft = m.score;
  else if (m.score && Array.isArray(m.score.ft)) ft = m.score.ft;
  return { date: m.date, time: m.time || "", round: m.round || "", home: m.team1, away: m.team2,
    hg: ft ? ft[0] : null, ag: ft ? ft[1] : null };
}
async function fromOpenFootball(code, season) {
  const r = await fetch(`https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${code}.json`, { next: { revalidate: REVALIDATE } });
  if (!r.ok) throw new Error(`openfootball ${season}/${code}: ${r.status}`);
  const j = await r.json();
  return (j.matches || []).map(normOF);
}
async function fromFootballData(code, season, key) {
  const r = await fetch(`https://api.football-data.org/v4/competitions/${code}/matches?season=${season}`, { headers: { "X-Auth-Token": key }, next: { revalidate: REVALIDATE } });
  if (!r.ok) throw new Error(`football-data ${code}: ${r.status}`);
  const j = await r.json();
  return (j.matches || []).map((m) => {
    const d = new Date(m.utcDate); const local = new Date(d.getTime() + 3 * 3600e3); // EAT
    const done = m.status === "FINISHED";
    return { date: local.toISOString().slice(0, 10), time: local.toISOString().slice(11, 16) + " EAT", round: m.matchday ? `Matchday ${m.matchday}` : "",
      home: m.homeTeam.shortName || m.homeTeam.name, away: m.awayTeam.shortName || m.awayTeam.name,
      hg: done ? m.score.fullTime.home : null, ag: done ? m.score.fullTime.away : null };
  });
}

export async function getLeagueData(league) {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (key) {
    try {
      const [cur, prev] = await Promise.all([fromFootballData(league.fd, SEASON.fdCur, key), fromFootballData(league.fd, SEASON.fdPrev, key).catch(() => [])]);
      if (cur.length) return { cur, prev, source: "football-data.org", season: "2026/27" };
    } catch (e) { console.error(e.message); }
  }
  const [cur, prev] = await Promise.all([fromOpenFootball(league.of, SEASON.cur), fromOpenFootball(league.of, SEASON.prev).catch(() => [])]);
  return { cur, prev, source: "openfootball", season: "2026/27" };
}
