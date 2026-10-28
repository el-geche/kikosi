# Kikosi: football analysis (informational)

Live: https://kikosi-ke.vercel.app

Kikosi is an independent football statistics site for the Premier League, La Liga, Bundesliga, Serie A and Ligue 1. It shows form guides, head-to-head records, home/away splits, side-by-side team histories and transparent **model** probabilities.

> 18+ · Informational analysis only. No predictions or guarantees, no betting, accounts or payments. "Fair odds" are model estimates (1 ÷ probability), **not bookmaker odds**. Kenya help: [GRA self-exclusion](https://gra.go.ke/self-exclusion-process/), toll-free 0800 723 770.

## Features
- League pages: upcoming fixture cards with a markets row (Home/Draw/Away, Over/Under 2.5, BTTS) showing model probability and fair odds, a "Model read", a side-by-side team history comparison with a "History favours" badge and reason, H2H, and the most likely score
- Standings with W/D/L last-5 form, home/away records and latest results
- Pick-12 Lab: build a just-for-fun 12-match 1/X/2 slip (saved in localStorage) with combined model probability and fair odds, plus a ranking of upcoming matches by the likelihood of their most likely outcome, with reasons
- Strategy: an educational guide to bankroll management, value and the Kelly criterion, and how the model works
- Dark/light theme, responsive layout, subtle animations

## Data
- **Primary: football-data.org v4** (PL, PD, BL1, SA, FL1) for current 2026/27 fixtures and results. Needs `FOOTBALL_DATA_API_KEY`, which is set as a Vercel env var and never committed. One call per league, cached in the Next.js data cache for 2 minutes (`REVALIDATE = 120` in `lib/data.js`), so at most ~2.5 calls/min, under the free tier's 10 requests/minute. Pages are rendered per request (`dynamic = "force-dynamic"`) so each fixture is classified as live, upcoming or finished against the current time; finished results feed standings, form and the model. Kick-off times are converted to EAT (UTC+3).
- **openfootball/football.json** (keyless) for the 2025/26 season (model priors and H2H, with team names aligned to football-data), and as a full fallback if the API fails or no key is set.

## Model
Home and away attack/defence strengths are shrunk toward last season (or a promoted-team prior), with a small last-5 form adjustment. They feed Poisson goals, which give 1X2, O/U 2.5, BTTS and the most likely score. See `lib/model.js`.

## Run locally
```bash
npm install
npm run dev                 # http://localhost:3000
npm run build && npm start  # production
vercel env pull .env.local   # pulls FOOTBALL_DATA_API_KEY for local use (gitignored)
```

## Prediction game (branch `feature/predictions`, preview only)
A free prediction game for fun. Not betting. No money in, no money out. It only switches on when `DATABASE_URL` and `SESSION_SECRET` are set (Neon free plan, Preview and Development only). Production has neither, so kikosi-ke.vercel.app keeps the legacy read-only path.

Env var names (values live in Vercel only): `DATABASE_URL`, `SESSION_SECRET`, `FOOTBALL_DATA_API_KEY`, `CRON_SECRET`, optional `ADMIN_HANDLES` (comma-separated handles that can hide comments and pin recap items).

Set up: `node scripts/migrate.mjs` (idempotent, applies `db/schema.sql`). Tests: `npm test`.

### Football-data scheduler (`lib/fdPlan.js` pure, `lib/fdScheduler.js` runtime)
- Budget: 9 calls per rolling 60 s (the free tier allows 10). Shared across all instances through Postgres (`fd_acquire` takes an advisory lock, counts `fd_calls` in the last 60 s, checks the job lease and back-off, then records the call). One fetcher wins each job; the others read the cached copy.
- Honours `X-Requests-Available-Minute` (stops when ≤1 left) and `X-RequestCounter-Reset`. On 429: back off for max(reset, 15 s × 2ⁿ, capped at 240 s); success resets it.
- Leagues are staggered 12 s apart. Intervals: idle 15 min, upcoming (kick-off within 2 h) 5 min, live leagues share the leftover budget (≥15 s each). The light live call `/v4/matches?status=IN_PLAY,PAUSED&competitions=PL,PD,BL1,SA,FL1` runs every 20 s with two or more live leagues, otherwise every 60 s.
- Priority when several jobs are due: live call, live leagues, upcoming, idle, on-demand.
- The scheduler has no always-on worker (Hobby). `tick()` runs at most one due job and is triggered by page renders (`waitUntil`), SSE streams and polling endpoints, plus a daily cron safety net. `/api/fd/status` shows the plan, the budget window and calls per minute.

### Realtime
- `/api/stream` is Server-Sent Events. Writes go to the Neon `events` table (id cursor). Within an instance, an in-memory emitter pushes instantly. Across instances, each stream polls `events` after its cursor every 1 s while active (an event in the last 30 s), 3 s when warm and 5 s when quiet. Streams end after ~55 s, and the browser reconnects with `Last-Event-ID`, so nothing is missed.
- Write responses (comments, reactions, predictions) include the event they created, so the writer's UI updates immediately.
- Fallback: if EventSource fails, the client polls `/api/events?after=<id>`.
- Swapping to a hosted provider (Ably, Pusher, Supabase Realtime, Vercel-compatible websockets): keep `lib/events.js publish()` as the single write path and add a provider publish next to the insert. In `components/useRealtime.js`, replace the EventSource with the provider's subscribe for the same event names (`live`, `final`, `settled`, `comment`, `comment_removed`, `reaction`, `pin`). The cursor table stays as the replay log. Not done here: free only.

### Caching
- Upstream football-data responses are cached (Vercel Runtime Cache plus a Postgres copy) and served stale-while-revalidate: teams and squads 24 h, scorers 1 h, league feeds on the scheduler cadence above.
- Public, non-personalised GETs send a weak ETag and a CDN `s-maxage`: `/api/leaderboard` and `/api/members` 8 s; `/api/clubs` and `/api/fantasy/players` 10 min with 1 h stale-while-revalidate. Personalised responses (`/api/live` with your live points, `/api/predictions`, `/api/member`) are `private, no-cache` with ETag/304 and are never CDN-cached.

### Privacy and moderation
- Other members' picks are never returned before kick-off. Before kick-off, only an anonymous H/D/A split is shown, and only when there are ≥3 picks.
- Public member fields are a whitelist: handle, tier, points, streak, best streak, weekly points, badges.
- Comments are ≤140 characters with no links or phone numbers and a slur filter. They are rate-limited (10 per 10 minutes). Members can report and mute, and `ADMIN_HANDLES` can hide.
