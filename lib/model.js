// Simple, transparent model: shrunk home/away attack & defence strengths -> Poisson goals -> 1X2 probabilities.
import { cleanName } from "./data";
const played = (m) => m.hg !== null && m.hg !== undefined;
export const todayEAT = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

function teamTable(matches) {
  const t = {};
  const get = (n) => (t[n] ??= { name: n, short: cleanName(n), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0,
    home: { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, away: { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, results: [] });
  for (const m of matches) {
    get(m.home); get(m.away);
    if (!played(m)) continue;
    const sides = [[m.home, m.hg, m.ag, "home", m.away], [m.away, m.ag, m.hg, "away", m.home]];
    for (const [n, f, a, side, opp] of sides) {
      const r = f > a ? "W" : f === a ? "D" : "L"; const x = t[n];
      for (const o of [x, x[side]]) { o.p++; o.gf += f; o.ga += a; o[r.toLowerCase() === "w" ? "w" : r === "D" ? "d" : "l"]++; }
      x.pts += r === "W" ? 3 : r === "D" ? 1 : 0;
      x.results.push({ date: m.date, r, f, a, opp: cleanName(opp), side });
    }
  }
  for (const x of Object.values(t)) { x.results.sort((a, b) => a.date.localeCompare(b.date)); x.form = x.results.slice(-5).map((z) => z.r); x.gd = x.gf - x.ga; }
  return t;
}

const avg = (ms, k) => { const p = ms.filter(played); return p.length ? p.reduce((s, m) => s + m[k], 0) / p.length : null; };

export function poisson(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
export function outcomeProbs(lh, la) {
  let H = 0, D = 0, A = 0, o25 = 0, btts = 0, best = [0, 0, 0];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = poisson(lh, i) * poisson(la, j);
    if (i > j) H += p; else if (i === j) D += p; else A += p;
    if (i + j > 2) o25 += p; if (i > 0 && j > 0) btts += p;
    if (p > best[2]) best = [i, j, p];
  }
  const s = H + D + A; return { H: H / s, D: D / s, A: A / s, o25, btts, score: `${best[0]}-${best[1]}` };
}

export function analyseLeague(data) {
  const { cur, prev } = data;
  const table = teamTable(cur), prevTable = teamTable(prev), hist = teamTable([...prev, ...cur]);
  const cp = cur.filter(played);
  const hAvg = (avg(cur, "hg") ?? 1.5) * cp.length / (cp.length + 40) + (avg(prev, "hg") ?? 1.5) * 40 / (cp.length + 40);
  const aAvg = (avg(cur, "ag") ?? 1.2) * cp.length / (cp.length + 40) + (avg(prev, "ag") ?? 1.2) * 40 / (cp.length + 40);
  const K = 5; // shrinkage: games of prior weight
  const strength = (n) => {
    const c = table[n], pv = prevTable[n];
    // prior: last season's per-game rates if the team was in this league, else a promoted-team prior (weaker)
    const pr = pv && pv.home.p > 3 ? { hgf: pv.home.gf / pv.home.p, hga: pv.home.ga / pv.home.p, agf: pv.away.gf / pv.away.p, aga: pv.away.ga / pv.away.p }
      : { hgf: hAvg * 0.85, hga: aAvg * 1.2, agf: aAvg * 0.85, aga: hAvg * 1.2 };
    const sh = (sum, n, prior) => (sum + K * prior) / (n + K);
    const f5 = c.form.length ? c.form.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0) / c.form.length : 1.4;
    const formMult = Math.min(1.08, Math.max(0.92, 1 + 0.06 * (f5 - 1.4) / 1.4));
    return { attH: sh(c.home.gf, c.home.p, pr.hgf) / hAvg * formMult, defH: sh(c.home.ga, c.home.p, pr.hga) / aAvg,
      attA: sh(c.away.gf, c.away.p, pr.agf) / aAvg * formMult, defA: sh(c.away.ga, c.away.p, pr.aga) / hAvg, ppg5: f5, promoted: !pv };
  };
  const strengths = Object.fromEntries(Object.keys(table).map((n) => [n, strength(n)]));
  const h2hAll = [...prev, ...cur].filter(played);
  const today = todayEAT();
  const upcomingAll = cur.filter((m) => !played(m) && m.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const horizon = upcomingAll[0] ? new Date(new Date(upcomingAll[0].date).getTime() + 8 * 864e5).toISOString().slice(0, 10) : today;
  const upcoming = upcomingAll.filter((m) => m.date <= horizon).slice(0, 12).map((m) => {
    const sh = strengths[m.home], sa = strengths[m.away];
    const lh = hAvg * sh.attH * sa.defA, la = aAvg * sa.attA * sh.defH;
    const pr = outcomeProbs(lh, la);
    const h2h = h2hAll.filter((x) => (x.home === m.home && x.away === m.away) || (x.home === m.away && x.away === m.home)).slice(-5)
      .map((x) => ({ date: x.date, home: cleanName(x.home), away: cleanName(x.away), hg: x.hg, ag: x.ag }));
    const H = table[m.home], A = table[m.away];
    const pick = pr.H >= pr.D && pr.H >= pr.A ? "1" : pr.A >= pr.D ? "2" : "X";
    const pp = { "1": pr.H, X: pr.D, "2": pr.A }[pick];
    const why = [];
    if (pick === "1") why.push(`${H.short} expected ${lh.toFixed(2)} goals vs ${la.toFixed(2)} for ${A.short}`);
    else if (pick === "2") why.push(`${A.short} expected ${la.toFixed(2)} goals vs ${lh.toFixed(2)} for ${H.short}`);
    else why.push(`Evenly matched: expected goals ${lh.toFixed(2)} vs ${la.toFixed(2)}`);
    if (H.home.p) why.push(`${H.short} at home: ${H.home.w}W ${H.home.d}D ${H.home.l}L (${H.home.gf}-${H.home.ga})`);
    if (A.away.p) why.push(`${A.short} away: ${A.away.w}W ${A.away.d}D ${A.away.l}L (${A.away.gf}-${A.away.ga})`);
    if (H.form.length || A.form.length) why.push(`Form (last 5): ${H.short} ${H.form.join("") || "–"}, ${A.short} ${A.form.join("") || "–"}`);
    if (h2h.length) { const hw = h2h.filter((x) => (x.home === H.short ? x.hg > x.ag : x.ag > x.hg)).length, aw = h2h.filter((x) => (x.home === A.short ? x.hg > x.ag : x.ag > x.hg)).length;
      why.push(`Recent H2H (${h2h.length}): ${H.short} ${hw}, ${A.short} ${aw}, draws ${h2h.length - hw - aw}`); }
    if (sh.promoted) why.push(`${H.short} promoted: uses a weaker-team prior`);
    if (sa.promoted) why.push(`${A.short} promoted: uses a weaker-team prior`);
    // Full-history side-by-side comparison (both seasons in the data)
    const HH = hist[m.home], AH = hist[m.away];
    const h2hFull = h2hAll.filter((x) => (x.home === m.home && x.away === m.away) || (x.home === m.away && x.away === m.home));
    const h2hRec = { hw: 0, d: 0, aw: 0 };
    for (const x of h2hFull) { const hs = x.home === m.home ? x.hg : x.ag, as = x.home === m.home ? x.ag : x.hg; if (hs > as) h2hRec.hw++; else if (hs < as) h2hRec.aw++; else h2hRec.d++; }
    const side = (T, hs, venue) => ({ name: T.short, p: T.p, w: T.w, d: T.d, l: T.l, gfpg: T.p ? T.gf / T.p : 0, gapg: T.p ? T.ga / T.p : 0,
      form: T.form, formW: T.form.filter((r) => r === "W").length, venue, split: T[venue], seasonPts: hs.pts, seasonPos: 0 });
    const cmpH = side(HH, H, "home"), cmpA = side(AH, A, "away");
    const fav = pick === "1" ? cmpH : pick === "2" ? cmpA : null, oth = pick === "1" ? cmpA : cmpH;
    const reasons = [];
    if (fav) {
      const favH2H = pick === "1" ? [h2hRec.hw, h2hRec.aw] : [h2hRec.aw, h2hRec.hw];
      if (fav.formW > oth.formW) reasons.push(`better form (${fav.formW}W in last 5 vs ${oth.formW}W)`);
      if (h2hFull.length && favH2H[0] > favH2H[1]) reasons.push(`${favH2H[0]}-${favH2H[1]} H2H record (${h2hRec.d} draws)`);
      const fs = fav.split, os = oth.split;
      if (fs.p && os.p && fs.w / fs.p > os.w / os.p) reasons.push(`stronger ${fav.venue} record (${fs.w}/${fs.p} wins) than ${oth.name} ${oth.venue} (${os.w}/${os.p})`);
      if (fav.gfpg - fav.gapg > oth.gfpg - oth.gapg) reasons.push(`better goal difference per game (${(fav.gfpg - fav.gapg).toFixed(2)} vs ${(oth.gfpg - oth.gapg).toFixed(2)})`);
      if (!reasons.length) reasons.push(pick === "1" ? "home advantage in the model outweighs the small gaps in the record" : "higher modelled attack/defence strength");
    } else reasons.push(`closely matched records (${cmpH.formW}W vs ${cmpA.formW}W in last 5; H2H ${h2hRec.hw}-${h2hRec.d}-${h2hRec.aw})`);
    const favours = { pick, team: fav ? fav.name : "Draw", reason: (fav ? "" : "") + reasons.slice(0, 2).join(" and ").replace(/^./, (c) => c.toUpperCase()) };
    return { compare: { home: cmpH, away: cmpA, h2h: h2hRec, h2hN: h2hFull.length }, favours, id: `${m.date}-${m.home}-${m.away}`.replace(/\W+/g, "-"), date: m.date, time: m.time, round: m.round,
      home: H.short, away: A.short, lh, la, ...pr, pick, pickProb: pp, why,
      homeForm: H.form, awayForm: A.form, h2h,
      homeSplit: H.home, awaySplit: A.away, homeAll: { gf: H.gf, ga: H.ga, p: H.p }, awayAll: { gf: A.gf, ga: A.ga, p: A.p } };
  });
  const standings = Object.values(table).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.short.localeCompare(b.short));
  const recent = cp.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 10)
    .map((m) => ({ date: m.date, home: cleanName(m.home), away: cleanName(m.away), hg: m.hg, ag: m.ag }));
  const lastResult = cp.reduce((d, m) => (m.date > d ? m.date : d), "");
  const awaiting = cur.filter((m) => !played(m) && m.date < today).length;
  return { standings, upcoming, recent, lastResult, awaiting, played: cp.length, hAvg, aAvg, source: data.source, season: data.season };
}
