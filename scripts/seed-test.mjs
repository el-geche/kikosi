// TEST seed for the PREVIEW/DEV database only (never production). Every row is clearly labelled:
// members TEST_*, matches competition 'TEST' with ids 900000001+. Usage:
//   node --env-file=.env.local scripts/seed-test.mjs          seed (idempotent: cleans first)
//   node --env-file=.env.local scripts/seed-test.mjs --clean  remove all TEST data
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
if (process.env.VERCEL_ENV === "production") { console.error("Refusing to seed production."); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);
const ID0 = 900000000, H = 3600e3, now = Date.now();

async function clean() {
  await sql`delete from recap_pins where week_start in (select week_start from recaps where summary->>'test' = 'true')`;
  await sql`delete from recaps where summary->>'test' = 'true'`;
  await sql`delete from weekly_results where winner_id in (select id from members where handle::text like 'TEST\\_%') or (winner_id is null and week_start > now() - interval '35 days' and not exists (select 1 from members where handle::text not like 'TEST\\_%'))`;
  await sql`delete from members where handle::text like 'TEST\\_%'`;
  await sql`delete from matches where competition = 'TEST' and id > ${ID0}`;
  await sql`delete from events where payload::text like '%TEST%' or payload::text like '%9000000%'`;
}
if (process.argv.includes("--clean")) { await clean(); console.log("TEST data removed."); process.exit(0); }
await clean();

const handles = ["TEST_Achieng", "TEST_Baraka", "TEST_Chebet", "TEST_Daudi", "TEST_Esther", "TEST_Faraji", "TEST_Gathoni", "TEST_Hamisi"];
const m = {};
for (const h of handles) {
  const r = await sql`insert into members (handle, recovery_hash, is_18_confirmed, created_at, fav_team_id)
    values (${h}, ${createHash("sha256").update(randomBytes(16)).digest("hex")}, true, ${new Date(now - 20 * 864e5).toISOString()}, null) returning id`;
  m[h] = r[0].id;
}
// Fixtures: 5 last week, 3 earlier this week (all finished), 2 in play now, 2 upcoming. Times relative to now.
const day = (d, hr = 19) => { const t = new Date(now + d * 864e5); t.setUTCHours(hr - 3, 0, 0, 0); return t.getTime(); }; // hr in EAT
const fx = [
  [1, "Simba", "Yanga", day(-8), "FINISHED", 2, 1], [2, "Gor", "Leopards", day(-7), "FINISHED", 0, 0], [3, "Tusker", "Ulinzi", day(-6), "FINISHED", 1, 3],
  [4, "Bandari", "Sofapaka", day(-5), "FINISHED", 2, 2], [5, "KCB", "Posta", day(-4), "FINISHED", 1, 0],
  [6, "Yanga", "Gor", day(-2), "FINISHED", 3, 1], [7, "Leopards", "Simba", day(-1, 17), "FINISHED", 1, 1], [8, "Ulinzi", "KCB", day(-1, 21), "FINISHED", 0, 2],
  [9, "Sofapaka", "Tusker", now - 35 * 60e3, "IN_PLAY", 1, 0], [10, "Posta", "Bandari", now - 80 * 60e3, "IN_PLAY", 1, 1],
  [11, "Simba", "Gor", now + 2 * H, "TIMED"], [12, "Yanga", "Leopards", now + 26 * H, "TIMED"],
];
// Older history (3 weeks before) so the tiers differ.
const T = ["Simba", "Yanga", "Gor", "Leopards", "Tusker", "Ulinzi", "Bandari", "Sofapaka", "KCB", "Posta"];
for (let i = 13; i <= 36; i++) fx.push([i, T[i % 10], T[(i * 3 + 1) % 10] === T[i % 10] ? T[(i + 5) % 10] : T[(i * 3 + 1) % 10], day(-30 + Math.floor((i - 13) * 0.85), 16 + (i % 3) * 2), "FINISHED", i % 4, (i * 7) % 3]);
for (const [i, h, a, ko, st, x, y] of fx) {
  const fin = st === "FINISHED";
  await sql`insert into matches (id, competition, season, matchday, home, away, home_short, away_short, kickoff_utc, status, ft_home, ft_away, live_home, live_away)
    values (${ID0 + i}, 'TEST', 2026, ${i > 12 ? 0 : i <= 5 ? 1 : 2}, ${"TEST " + h}, ${"TEST " + a}, ${h}, ${a}, ${new Date(ko).toISOString()}, ${st},
      ${fin ? x : null}, ${fin ? y : null}, ${st === "IN_PLAY" ? x : null}, ${st === "IN_PLAY" ? y : null})`;
}
// Deterministic picks: each member has a "style" so the boards differ.
const rnd = (s) => { let x = s * 9301 + 49297; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); };
for (const [k, h] of handles.entries()) {
  const r = rnd(k + 1);
  for (const [i, , , ko, st, x, y] of fx) {
    if (i === 12 && k > 4) continue; // only 5 picks on the later fixture
    let hg = Math.floor(r() * 4), ag = Math.floor(r() * 3);
    if (st === "FINISHED" && r() < (i > 12 ? 0.08 + k * 0.07 : 0.18 + k * 0.03)) { hg = x; ag = y; } // some exact hits
    await sql`insert into predictions (member_id, match_id, home_goals, away_goals, created_at) values (${m[h]}, ${ID0 + i}, ${hg}, ${ag}, ${new Date(ko - 5 * H).toISOString()})`;
  }
}
// Banter (last week and this week) and reactions on settled predictions.
const lastWeek = (h) => new Date(day(-6) + h * H).toISOString(), thisWeek = (h) => new Date(day(-1, 22) + h * H).toISOString();
const say = [["TEST_Baraka", "TEST_Achieng", "That 2-1 call was pure witchcraft 🧙", lastWeek(1)], ["TEST_Chebet", "TEST_Achieng", "Teach us your ways!", lastWeek(2)],
  ["TEST_Daudi", "TEST_Baraka", "0-0? Brave. Wrong, but brave 😂", lastWeek(3)], ["TEST_Achieng", "TEST_Esther", "Streak queen this week 🔥", thisWeek(1)],
  ["TEST_Faraji", "TEST_Gathoni", "See you on the board next week", thisWeek(2)]];
for (const [a, t, b, at] of say) await sql`insert into comments (author_id, target_member_id, body, created_at) values (${m[a]}, ${m[t]}, ${b}, ${at})`;
const reacts = [["TEST_Baraka", "TEST_Achieng", 1, "🐐"], ["TEST_Chebet", "TEST_Achieng", 1, "🔥"], ["TEST_Daudi", "TEST_Achieng", 1, "👏"], ["TEST_Esther", "TEST_Baraka", 2, "😂"],
  ["TEST_Faraji", "TEST_Baraka", 2, "🤡"], ["TEST_Achieng", "TEST_Esther", 6, "🔥"], ["TEST_Gathoni", "TEST_Esther", 7, "👏"], ["TEST_Hamisi", "TEST_Daudi", 8, "😬"]];
for (const [a, t, mid, e] of reacts) await sql`insert into reactions (reactor_id, target_member_id, target_match_id, emoji, created_at)
  values (${m[a]}, ${m[t]}, ${ID0 + mid}, ${e}, ${mid <= 5 ? lastWeek(4) : thisWeek(3)}) on conflict do nothing`;
console.log(`Seeded ${handles.length} TEST members, ${fx.length} TEST fixtures. Now run settle (scripts/seed-test.mjs does not score).`);
