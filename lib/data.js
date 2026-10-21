// Data layer: openfootball (keyless, public JSON on GitHub) with optional football-data.org if FOOTBALL_DATA_API_KEY is set.
export const LEAGUES = [
  { slug: "premier-league", name: "Premier League", country: "England", of: "en.1", fd: "PL", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { slug: "la-liga", name: "La Liga", country: "Spain", of: "es.1", fd: "PD", flag: "🇪🇸" },
  { slug: "bundesliga", name: "Bundesliga", country: "Germany", of: "de.1", fd: "BL1", flag: "🇩🇪" },
  { slug: "serie-a", name: "Serie A", country: "Italy", of: "it.1", fd: "SA", flag: "🇮🇹" },
  { slug: "ligue-1", name: "Ligue 1", country: "France", of: "fr.1", fd: "FL1", flag: "🇫🇷" },
];
const SEASON = { cur: "2026-27", prev: "2025-26", fdCur: 2026, fdPrev: 2025 };
// Data cache: football-data.org responses are cached for 2 min (5 leagues -> at most ~2.5 req/min, under the free tier's 10 req/min).
// Pages render per request (force-dynamic), so live/upcoming/finished is always judged against the current time.
export const REVALIDATE = 120;
const PREV_REVALIDATE = 86400; // previous season is complete and static
const MEMO_MS = 60e3;

const DISPLAY = new Map(); // football-data full name -> shortName
export const cleanName = (n) => DISPLAY.get(n) || n.replace(/\s+(FC|AFC|CF|CFC)$/i, "").replace(/^(FC|AFC)\s+/i, "").trim();

const EAT = 3 * 3600e3; // Africa/Nairobi = UTC+3, no DST
const eatParts = (ms) => { const iso = new Date(ms + EAT).toISOString(); return { date: iso.slice(0, 10), time: iso.slice(11, 16) + " EAT" }; };
function normOF(m) {
  let ft = null, ht = null;
  if (Array.isArray(m.score)) ft = m.score;
  else if (m.score && Array.isArray(m.score.ft)) { ft = m.score.ft; ht = Array.isArray(m.score.ht) ? m.score.ht : null; }
  // openfootball times are local European kick-offs (CET/CEST); approximate as UTC+2 / UTC+1 for kick-off ordering.
  const [Y, M] = m.date.split("-").map(Number), off = M >= 4 && M <= 10 ? 2 : 1;
  const ko = m.time ? Date.parse(`${m.date}T${m.time}:00Z`) - off * 3600e3 : Date.parse(`${m.date}T12:00:00Z`);
  const t = m.time ? eatParts(ko) : { date: m.date, time: "" };
  return { ...t, ko, round: m.round || "", home: m.team1, away: m.team2, status: ft ? "FINISHED" : "SCHEDULED",
    hg: ft ? ft[0] : null, ag: ft ? ft[1] : null, ht: ht ? { h: ht[0], a: ht[1] } : null };
}
async function fromOpenFootball(code, season, revalidate = REVALIDATE) {
  const r = await fetch(`https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${code}.json`, { next: { revalidate } });
  if (!r.ok) throw new Error(`openfootball ${season}/${code}: ${r.status}`);
  const j = await r.json();
  return (j.matches || []).map(normOF);
}
async function fromFootballData(code, season, key) {
  const url = `https://api.football-data.org/v4/competitions/${code}/matches?season=${season}`;
  let r;
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch(url, { headers: { "X-Auth-Token": key }, next: { revalidate: REVALIDATE, tags: ["fd"] } });
    if (r.status !== 429) break;
    // free tier: 10 req/min. Pages render per request, so wait briefly once, then fall back to the last good copy.
    const wait = Math.min(12, Number(r.headers.get("x-requestcounter-reset")) || 10);
    await new Promise((res) => setTimeout(res, (wait + 1) * 1000));
  }
  if (!r.ok) throw new Error(`football-data ${code}: ${r.status}`);
  const j = await r.json();
  for (const m of j.matches || []) for (const t of [m.homeTeam, m.awayTeam]) if (t?.name && t.shortName) DISPLAY.set(t.name, t.shortName);
  return (j.matches || []).filter((m) => m.homeTeam?.name && m.awayTeam?.name).map((m) => {
    const ko = Date.parse(m.utcDate), ft = m.score?.fullTime, ht = m.score?.halfTime;
    // Only FINISHED (or AWARDED) matches with a full-time score count as results; IN_PLAY/PAUSED scores are live, not final.
    const done = (m.status === "FINISHED" || m.status === "AWARDED") && ft?.home != null;
    const live = (m.status === "IN_PLAY" || m.status === "PAUSED" || m.status === "LIVE") && ft?.home != null;
    return { ...eatParts(ko), ko, round: m.matchday ? `Matchday ${m.matchday}` : "",
      home: m.homeTeam.name, away: m.awayTeam.name, hs: m.homeTeam.shortName, as: m.awayTeam.shortName, status: m.status,
      hg: done ? ft.home : null, ag: done ? ft.away : null,
      liveH: live ? ft.home : null, liveA: live ? ft.away : null,
      ht: ht?.home != null ? { h: ht.home, a: ht.away } : null };
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

const MEMO = new Map(), LAST_GOOD = new Map();
export function getLeagueData(league) {
  const hit = MEMO.get(league.slug);
  if (hit && Date.now() - hit.t < MEMO_MS) return hit.p;
  const p = loadLeague(league).catch((e) => { MEMO.delete(league.slug); throw e; });
  MEMO.set(league.slug, { t: Date.now(), p });
  return p;
}
async function loadLeague(league) {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  // Previous season (priors + H2H) always comes from openfootball: complete, static, and saves API calls.
  const prevP = fromOpenFootball(league.of, SEASON.prev, PREV_REVALIDATE).catch(() => []);
  if (key) {
    try {
      const cur = await fromFootballData(league.fd, SEASON.fdCur, key);
      if (cur.length) { const d = { cur, prev: alignNames(await prevP, cur), source: "football-data.org", season: "2026/27" }; LAST_GOOD.set(league.slug, d); return d; }
    } catch (e) {
      console.error("football-data failed:", e.message);
      if (LAST_GOOD.has(league.slug)) return LAST_GOOD.get(league.slug);
    }
  }
  const cur = await fromOpenFootball(league.of, SEASON.cur);
  return { cur, prev: alignNames(await prevP, cur), source: "openfootball (fallback)", season: "2026/27" };
}
