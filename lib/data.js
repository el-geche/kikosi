// Data layer: openfootball (keyless, public JSON on GitHub) with optional football-data.org if FOOTBALL_DATA_API_KEY is set.
export const LEAGUES = [
  { slug: "premier-league", name: "Premier League", country: "England", of: "en.1", fd: "PL", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { slug: "la-liga", name: "La Liga", country: "Spain", of: "es.1", fd: "PD", flag: "🇪🇸" },
  { slug: "bundesliga", name: "Bundesliga", country: "Germany", of: "de.1", fd: "BL1", flag: "🇩🇪" },
  { slug: "serie-a", name: "Serie A", country: "Italy", of: "it.1", fd: "SA", flag: "🇮🇹" },
  { slug: "ligue-1", name: "Ligue 1", country: "France", of: "fr.1", fd: "FL1", flag: "🇫🇷" },
];
const SEASON = { cur: "2026-27", prev: "2025-26", fdCur: 2026, fdPrev: 2025 };
const REVALIDATE = 1800; // 30 min ISR: at most one football-data.org call per league per 30 min (5 leagues, well under 10 req/min)

const DISPLAY = new Map(); // football-data full name -> shortName
export const cleanName = (n) => DISPLAY.get(n) || n.replace(/\s+(FC|AFC|CF|CFC)$/i, "").replace(/^(FC|AFC)\s+/i, "").trim();

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
const SKIP = new Set(["POSTPONED", "CANCELLED", "SUSPENDED", "AWARDED"]);
async function fromFootballData(code, season, key) {
  const url = `https://api.football-data.org/v4/competitions/${code}/matches?season=${season}`;
  let r;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch(url, { headers: { "X-Auth-Token": key }, next: { revalidate: REVALIDATE, tags: ["fd"] } });
    if (r.status !== 429) break;
    const wait = Math.min(65, Number(r.headers.get("x-requestcounter-reset")) || 30); // free tier: 10 req/min
    await new Promise((res) => setTimeout(res, (wait + 1) * 1000));
  }
  if (!r.ok) throw new Error(`football-data ${code}: ${r.status}`);
  const j = await r.json();
  for (const m of j.matches || []) for (const t of [m.homeTeam, m.awayTeam]) if (t?.name && t.shortName) DISPLAY.set(t.name, t.shortName);
  return (j.matches || []).filter((m) => !SKIP.has(m.status)).map((m) => {
    const local = new Date(new Date(m.utcDate).getTime() + 3 * 3600e3); // Africa/Nairobi = UTC+3, no DST
    const done = m.status === "FINISHED" && m.score?.fullTime?.home != null;
    return { date: local.toISOString().slice(0, 10), time: local.toISOString().slice(11, 16) + " EAT", round: m.matchday ? `Matchday ${m.matchday}` : "",
      home: m.homeTeam.name, away: m.awayTeam.name, hs: m.homeTeam.shortName, as: m.awayTeam.shortName, status: m.status,
      hg: done ? m.score.fullTime.home : null, ag: done ? m.score.fullTime.away : null };
  });
}
// Match team names across sources (accents, FC/AFC/CF suffixes, punctuation)
const nkey = (n) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\b(fc|afc|cf|cfc|sc|ac|ssc|acf|calcio|club|de|futbol|1\.)\b/g, "").replace(/[^a-z0-9]/g, "");
function alignNames(prev, cur) {
  const map = new Map(); for (const m of cur) for (const n of [m.home, m.away]) map.set(nkey(n), n);
  const fix = (n) => map.get(nkey(n)) || n;
  return prev.map((m) => ({ ...m, home: fix(m.home), away: fix(m.away) }));
}

const MEMO = new Map();
export function getLeagueData(league) {
  const hit = MEMO.get(league.slug);
  if (hit && Date.now() - hit.t < REVALIDATE * 1000) return hit.p;
  const p = loadLeague(league).catch((e) => { MEMO.delete(league.slug); throw e; });
  MEMO.set(league.slug, { t: Date.now(), p });
  return p;
}
async function loadLeague(league) {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  // Previous season (priors + H2H) always comes from openfootball: complete, static, and saves API calls.
  const prevP = fromOpenFootball(league.of, SEASON.prev).catch(() => []);
  if (key) {
    try {
      const cur = await fromFootballData(league.fd, SEASON.fdCur, key);
      if (cur.length) return { cur, prev: alignNames(await prevP, cur), source: "football-data.org", season: "2026/27" };
    } catch (e) { console.error("football-data failed, falling back to openfootball:", e.message); }
  }
  const cur = await fromOpenFootball(league.of, SEASON.cur);
  return { cur, prev: alignNames(await prevP, cur), source: "openfootball (fallback)", season: "2026/27" };
}
