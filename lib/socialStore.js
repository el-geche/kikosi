// Database side of the members panel, banter (reactions/comments), member split and recaps. Server-only.
import { db } from "./db.js";
import { publish } from "./events.js";
import { publicMember, toggleReaction, validateComment, commentAllowed, COMMENT_LIMIT, MEMBERS_PAGE_SIZE, publicPredictions, adminHandles } from "./social.js";
import { eatWeek, MIN_SETTLED_FOR_BOARD } from "./game.js";
import { memberSplit, selectRecap, weekKey } from "./live.js";

// ---- (E) members panel ----------------------------------------------------------------------------
export const SORTS = { points: "points desc, handle", streak: "streak desc, points desc, handle", weekly: "weekly desc, points desc, handle" };
export async function membersList({ q = "", sort = "points", page = 1, now = Date.now() } = {}) {
  const w = eatWeek(now), s = new Date(w.start).toISOString(), e = new Date(w.end).toISOString();
  const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const off = (Math.max(1, page) - 1) * MEMBERS_PAGE_SIZE;
  const order = SORTS[sort] ? sort : "points";
  const rows = await db()`with base as (
      select m.handle::text as handle, coalesce(s.points, 0)::int as points, coalesce(s.current_streak, 0)::int as streak,
        coalesce(s.best_streak, 0)::int as best_streak,
        (select coalesce(sum(p.points), 0)::int from predictions p join matches x on x.id = p.match_id
          where p.member_id = m.id and not p.voided and p.points is not null and x.kickoff_utc >= ${s} and x.kickoff_utc < ${e}) as weekly,
        (select count(*)::int from member_badges b where b.member_id = m.id) as badge_count
      from members m left join member_stats s on s.member_id = m.id
      where not m.banned and m.handle::text ilike ${like})
    select *, count(*) over ()::int as total from base
    order by case when ${order} = 'streak' then streak when ${order} = 'weekly' then weekly else points end desc, points desc, handle
    limit ${MEMBERS_PAGE_SIZE} offset ${off}`;
  return { rows: rows.map(publicMember), total: rows[0]?.total ?? 0, page: Math.max(1, page), pageSize: MEMBERS_PAGE_SIZE, sort: order };
}

// ---- (F) banter ---------------------------------------------------------------------------------
const idOf = async (handle) => (await db()`select id from members where handle = ${handle} and not banned`)[0]?.id || null;
export async function wall(handle, viewerId = null, now = Date.now()) {
  const sql = db(); const id = await idOf(handle); if (!id) return null;
  const comments = await sql`select c.id, a.handle::text as author, c.body, c.created_at, (c.author_id = ${viewerId}) as mine
    from comments c join members a on a.id = c.author_id
    where c.target_member_id = ${id} and not c.hidden and not a.banned
      and (${viewerId}::uuid is null or c.author_id not in (select muted_id from mutes where member_id = ${viewerId}::uuid))
    order by c.created_at desc, c.id desc limit 50`;
  const reactions = await sql`select coalesce(target_match_id, 0) as match_id, emoji, count(*)::int as n,
      bool_or(reactor_id = ${viewerId}) as mine
    from reactions where target_member_id = ${id} group by 1, 2`;
  const preds = await sql`select p.match_id, p.home_goals, p.away_goals, p.points, p.voided, p.settled_at, m.home_short, m.away_short,
      m.competition, m.kickoff_utc, m.ft_home, m.ft_away
    from predictions p join matches m on m.id = p.match_id
    where p.member_id = ${id} and m.kickoff_utc <= now() order by m.kickoff_utc desc limit 10`;
  const muted = viewerId ? (await sql`select 1 from mutes where member_id = ${viewerId} and muted_id = ${id}`).length > 0 : false;
  return { handle, comments: comments.map((c) => ({ id: Number(c.id), author: c.author, body: c.body, at: new Date(c.created_at).toISOString(), mine: !!c.mine })),
    reactions: reactions.map((r) => ({ matchId: Number(r.match_id) || null, emoji: r.emoji, n: r.n, mine: !!r.mine })),
    predictions: publicPredictions(preds, now).map((p) => ({ ...p, settled: preds.find((x) => x.match_id === p.matchId)?.settled_at != null })), muted };
}
export async function react(reactorId, handle, matchId, emoji, want) {
  const sql = db(); const target = await idOf(handle); if (!target) return { ok: false, error: "No such member." };
  if (matchId != null) {
    const p = await sql`select p.settled_at, p.voided, m.kickoff_utc from predictions p join matches m on m.id = p.match_id
      where p.member_id = ${target} and p.match_id = ${matchId}`;
    const { canReactToPrediction } = await import("./social.js");
    if (!canReactToPrediction(p[0])) return { ok: false, error: "You can react to a prediction once it is settled." };
  }
  const store = {
    has: async (k) => (await sql`select 1 from reactions where reactor_id = ${k.reactor} and target_member_id = ${k.target}
      and coalesce(target_match_id, 0) = ${k.matchId ?? 0} and emoji = ${k.emoji}`).length > 0,
    add: (k) => sql`insert into reactions (reactor_id, target_member_id, target_match_id, emoji) values (${k.reactor}, ${k.target}, ${k.matchId}, ${k.emoji}) on conflict do nothing`,
    remove: (k) => sql`delete from reactions where reactor_id = ${k.reactor} and target_member_id = ${k.target} and coalesce(target_match_id, 0) = ${k.matchId ?? 0} and emoji = ${k.emoji}`,
  };
  const r = await toggleReaction(store, { reactor: reactorId, target, matchId, emoji }, want);
  if (!r.ok) return r;
  const n = (await sql`select count(*)::int as n from reactions where target_member_id = ${target} and coalesce(target_match_id, 0) = ${matchId ?? 0} and emoji = ${emoji}`)[0].n;
  const event = await publish("reaction", { target: handle, matchId, emoji, n });
  return { ...r, n, event };
}
export async function addComment(author, handle, input) {
  const v = validateComment(input); if (!v.ok) return { ok: false, error: v.error, status: 400 };
  const sql = db(); const target = await idOf(handle); if (!target) return { ok: false, error: "No such member.", status: 404 };
  const recent = (await sql`select count(*)::int as n from comments where author_id = ${author.id} and created_at > now() - make_interval(secs => ${COMMENT_LIMIT.windowMs / 1000})`)[0].n;
  if (!commentAllowed(recent)) return { ok: false, error: "Easy, tiger: max 10 comments per 10 minutes.", status: 429 };
  const r = await sql`insert into comments (author_id, target_member_id, body) values (${author.id}, ${target}, ${v.body}) returning id, created_at`;
  const comment = { id: Number(r[0].id), author: author.handle, body: v.body, at: new Date(r[0].created_at).toISOString() };
  const event = await publish("comment", { target: handle, comment });
  return { ok: true, comment, event };
}
export async function removeComment(member, id, action) {
  const sql = db();
  const c = (await sql`select c.id, c.author_id, t.handle::text as target from comments c join members t on t.id = c.target_member_id where c.id = ${id}`)[0];
  if (!c) return { ok: false, status: 404, error: "Comment not found." };
  if (action === "report") {
    await sql`insert into comment_reports (comment_id, reporter_id) values (${id}, ${member.id}) on conflict do nothing`;
    return { ok: true, reported: true };
  }
  const isAdmin = adminHandles().has(member.handle.toLowerCase());
  if (action === "hide" ? !isAdmin : c.author_id !== member.id && !isAdmin) return { ok: false, status: 403, error: "Not allowed." };
  if (action === "hide") await sql`update comments set hidden = true where id = ${id}`; else await sql`delete from comments where id = ${id}`;
  const event = await publish("comment_removed", { target: c.target, id: Number(id) });
  return { ok: true, event };
}
export async function setMute(memberId, handle, on) {
  const target = await idOf(handle); if (!target || target === memberId) return { ok: false, error: "Can't mute that member." };
  if (on) await db()`insert into mutes (member_id, muted_id) values (${memberId}, ${target}) on conflict do nothing`;
  else await db()`delete from mutes where member_id = ${memberId} and muted_id = ${target}`;
  return { ok: true, muted: !!on };
}

// ---- (G) member split (anonymous aggregate, only when 3+ picks) ------------------------------------
export async function splits(ids) {
  if (!ids.length) return {};
  const rows = await db()`select match_id, home_goals, away_goals from predictions where match_id = any(${ids}::int[])`;
  const by = {}; for (const r of rows) (by[r.match_id] ||= []).push(r);
  return Object.fromEntries(ids.map((id) => [id, memberSplit(by[id] || [])]));
}

// ---- (G) recaps ---------------------------------------------------------------------------------
/** Builds the recap for a closed week once (idempotent: ON CONFLICT DO NOTHING; admin pin changes are preserved). */
export async function ensureRecap(weekStartMs) {
  const sql = db(); const s = new Date(weekStartMs).toISOString(), e = new Date(weekStartMs + 7 * 864e5).toISOString();
  if ((await sql`select 1 from recaps where week_start = ${s}`).length) return false;
  const reactionsByTarget = (await sql`select t.handle::text as handle, count(*)::int as count from reactions r join members t on t.id = r.target_member_id
    where r.created_at >= ${s} and r.created_at < ${e} and not t.banned group by t.handle`);
  const comments = (await sql`select c.id, a.handle::text as author, t.handle::text as target, c.body,
      (select count(*)::int from reactions r where r.target_member_id = c.target_member_id and r.created_at >= ${s} and r.created_at < ${e}) as "targetReactions"
    from comments c join members a on a.id = c.author_id join members t on t.id = c.target_member_id
    where c.created_at >= ${s} and c.created_at < ${e} and not c.hidden and not a.banned
      and c.id not in (select comment_id from comment_reports group by comment_id having count(*) >= 2)`).map((c) => ({ ...c, id: Number(c.id) }));
  const exacts = (await sql`select mb.handle::text as handle, m.id as "matchId", m.home_short as home, m.away_short as away,
      p.home_goals || '-' || p.away_goals as pick, (m.ft_home + m.ft_away)::int as goals,
      (select count(*)::int - 1 from predictions q where q.match_id = m.id and q.points = 3) as "sameExact"
    from predictions p join matches m on m.id = p.match_id join members mb on mb.id = p.member_id
    where p.points = 3 and m.kickoff_utc >= ${s} and m.kickoff_utc < ${e} and not mb.banned`);
  const streaks = await sql`select m.handle::text as handle, s.current_streak as streak from member_stats s join members m on m.id = s.member_id
    where not m.banned order by s.current_streak desc limit 10`;
  const board = async (end) => (await sql`select m.handle::text as handle, sum(p.points)::int as pts, count(*) filter (where p.points = 3)::int as ex
      from predictions p join matches x on x.id = p.match_id join members m on m.id = p.member_id
      where p.points is not null and not p.voided and x.kickoff_utc < ${end} and not m.banned group by m.handle
      having count(*) >= ${MIN_SETTLED_FOR_BOARD} order by pts desc, ex desc, m.handle`).map((r, i) => ({ handle: r.handle, rank: i + 1 }));
  const pins = selectRecap({ reactionsByTarget, comments, exacts, streaks, before: await board(s), after: await board(e) });
  const title = `Matchday recap · week of ${new Date(weekStartMs + 3 * 3600e3).toISOString().slice(0, 10)}`;
  const ins = await sql`insert into recaps (week_start, title, summary) values (${s}, ${title}, ${JSON.stringify({ exacts: exacts.length, comments: comments.length })}::jsonb)
    on conflict do nothing returning week_start`;
  if (!ins.length) return false;
  for (const p of pins) await sql`insert into recap_pins (week_start, kind, ref, data, score) values (${s}, ${p.kind}, ${p.ref}, ${JSON.stringify(p.data)}::jsonb, ${p.score})
    on conflict do nothing`;
  await publish("recap", { week: weekKey(weekStartMs) }).catch(() => {});
  return true;
}
/** Generates recaps for the last 4 closed weeks that have a decided weekly result. */
export async function recapsDue() {
  const rows = await db()`select w.week_start from weekly_results w left join recaps r on r.week_start = w.week_start where r.week_start is null order by 1 desc limit 4`;
  let n = 0; for (const r of rows) if (await ensureRecap(new Date(r.week_start).getTime())) n++;
  return n;
}
export async function getRecap(weekStartMs) {
  const s = new Date(weekStartMs).toISOString();
  const r = (await db()`select week_start, title, summary, created_at from recaps where week_start = ${s}`)[0];
  if (!r) return null;
  const pins = await db()`select kind, ref, data, score, pinned, by_admin from recap_pins where week_start = ${s} order by kind, score desc, ref`;
  return { week: weekKey(weekStartMs), weekStart: s, title: r.title, summary: r.summary, pins };
}
export async function listRecaps() { return (await db()`select week_start, title from recaps order by week_start desc limit 20`).map((r) => ({ week: weekKey(new Date(r.week_start).getTime()), title: r.title })); }
/** Admin pin/unpin. Pinning a comment by id adds it if it is not in the recap yet. */
export async function setPin(weekStartMs, kind, ref, pinned) {
  const sql = db(); const s = new Date(weekStartMs).toISOString();
  if (!(await sql`select 1 from recaps where week_start = ${s}`).length) return { ok: false, error: "No recap for that week." };
  if (kind === "comment") {
    const c = (await sql`select c.id, a.handle::text as author, t.handle::text as target, c.body from comments c join members a on a.id = c.author_id
      join members t on t.id = c.target_member_id where c.id = ${Number(ref) || 0} and not c.hidden`)[0];
    if (!c) return { ok: false, error: "Comment not found." };
    await sql`insert into recap_pins (week_start, kind, ref, data, score, pinned, by_admin) values (${s}, 'comment', ${String(c.id)}, ${JSON.stringify({ ...c, id: Number(c.id) })}::jsonb, 0, ${pinned}, true)
      on conflict (week_start, kind, ref) do update set pinned = excluded.pinned, by_admin = true`;
  } else {
    const r = await sql`update recap_pins set pinned = ${pinned}, by_admin = true where week_start = ${s} and kind = ${kind} and ref = ${ref} returning ref`;
    if (!r.length) return { ok: false, error: "Pin not found." };
  }
  return { ok: true };
}
