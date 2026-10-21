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
