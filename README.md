# West K-Town Fantasy Football

The league's one website: standings history, the draft lottery, keeper eligibility, stats and
each manager's team page, behind a single league login.

It consolidates four earlier apps — `west-ktown-stats` (standings history),
`fantasy-football-lottery`, `keepers-list` and `fantasy-parlay-tracker` (whose login and
team-claiming structure the whole site now uses) — into one React app.

**Live site:** https://amaryans.github.io/west-ktown-stats/

## What's in it

| Tab           | What it does                                                                                                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Preseason** | **Draft order** published for the season; the **Lottery** (NBA-style weighted draw, reveal-by-pick on draft night, publish the result league-wide); **Keepers** (eligibility boards per the league rules; who was kept is recorded and saved per season, for any year in the league's history). |
| **Stats**     | **All-time** standings across every season; **Manual stats** typed or pasted in from NFL.com; **Suggest a stat**, which files a GitHub issue automatically.                                                                                                                                     |
| **Standings** | Every season's regular-season standings from Sleeper, with the games-vs-median toggle.                                                                                                                                                                                                          |
| **Team**      | The signed-in manager's roster for any season and their history in the league (any team can be browsed), with a **Keeper value** view that prices each keeper against ADP.                                                                                                                      |
| **Settings**  | Profile and Sleeper team claim; commissioner: league settings, members, stat definitions, published data.                                                                                                                                                                                       |

The site is mobile-first: on phones the tabs become a bottom bar and tables collapse into cards.

**Login.** Same structure as the parlay tracker: members sign up with the league invite code and
claim their Sleeper team (one member per team). The first account becomes commissioner;
commissioners can promote others. A commissioner can also list Sleeper teams whose owners have
not signed up yet as placeholder members (Settings → Members, or the prompt on the Parlay tab),
so every week's parlay shows the whole league; a placeholder merges into the real account when
that person signs up with the same team. The parlay tracker's tables and house rules (one leg per
member per week, lock times, who may settle what) are carried over unchanged, so an existing
parlay database keeps working.

## Stack

- Frontend: React 19 + TypeScript + Vite, hosted on **GitHub Pages** (static, hash routing).
- Backend: **Supabase** free tier (Postgres, auth, row-level security). The browser only ever
  sees the public anon key; the policies in `supabase/schema.sql` protect the data.
- Sleeper's public API (no key) for league data, read directly from the browser.
- GitHub Actions for CI/deploy and for turning stat suggestions into issues.

## Setup

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a project (free tier is fine).
2. Open **SQL Editor**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), run it.
3. **Authentication → Sign In / Providers → Email**: decide about _Confirm email_. Off lets
   members use the site immediately; on works too, they click a confirmation link first.
4. **Authentication → URL Configuration**: set the Site URL to your Pages URL
   (`https://<you>.github.io/west-ktown-stats/`).
5. Note the **Project URL** and **anon public key** from **Project Settings → API**.
6. In **Table Editor → league_settings**, change `invite_code` from `CHANGE-ME`. Everything
   else (league name, season, Sleeper league ID) can be set from the site's Settings tab.

If you already run the parlay tracker on a Supabase project, run only section 4 of the schema
(the "Consolidated site tables") plus the `profiles_sleeper_user_idx` index and
`claimed_sleeper_users` function from section 2, then
`supabase/migrations/2026-09-18-placeholder-members.sql` — the login and parlay tables are the
same. The same migration upgrades a database created from an earlier copy of `schema.sql`.

### 2. Deploy to GitHub Pages

1. **Settings → Pages**: set _Source_ to **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add
   - `VITE_SUPABASE_URL` – the project URL
   - `VITE_SUPABASE_ANON_KEY` – the anon public key
3. Push to `main`. CI lints, typechecks, tests, builds and deploys.

If the repo is renamed or you use a custom domain, set the `VITE_BASE_PATH` variable (e.g. `/`).

### 3. First sign-in

1. Create your account first (it becomes commissioner).
2. **Settings → League**: paste the Sleeper league ID (any season's ID; earlier seasons are found
   automatically). Standings, team pages, the lottery import and keepers all switch on.
3. Claim your Sleeper team in your profile, then send the league the URL and invite code.

### 4. Stat suggestions → GitHub issues (optional but recommended)

Suggestions are stored in Supabase; the **File stat suggestions** workflow turns new ones into
issues labelled `stat-suggestion` and writes the issue number back.

1. **Settings → Secrets and variables → Actions → Secrets**: add `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API; this key bypasses row security, so it
   lives only in GitHub secrets, never in the app).
2. The workflow runs every six hours and can be run by hand from the Actions tab.
3. For instant filing, add a Supabase **Database Webhook** on `stat_suggestions` (insert) that
   POSTs to `https://api.github.com/repos/<you>/west-ktown-stats/dispatches` with headers
   `Authorization: Bearer <fine-grained PAT with Actions: write>`,
   `Accept: application/vnd.github+json` and body `{"event_type":"stat-suggestion"}`.

### 5. Automatic odds for the parlay board (optional)

Without this, odds are typed in by hand on each leg. With it, the Parlay → Odds board shows live
lines and a leg picked from the board can be re-priced with one tap.

1. Get a free API key from [the-odds-api.com](https://the-odds-api.com) (500 requests/month; the
   schedule uses about 40).
2. Add the **Secrets** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (same as step 4) and
   `ODDS_API_KEY`, and the **Variable** `ODDS_AUTOMATION_ENABLED` = `true`.
3. Run the _Fetch NFL odds_ workflow once from the Actions tab; it then runs Tuesday, Thursday
   and Sunday. Locally: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ODDS_API_KEY=... npm run fetch-odds`.

### 6. Real ADP for keeper value (optional, free)

The Team tab's **Keeper value** view compares where a player can be kept with his average draft
position. Without a sync it falls back to Sleeper's player rank; with it, ADP comes from
[Fantasy Football Calculator](https://fantasyfootballcalculator.com/adp)'s free mock-draft feed
(no API key) into an "ADP" manual stat, which the view picks up automatically.

1. Make sure the **Secrets** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set (step 4).
2. Run the _Fetch ADP_ workflow from the Actions tab. It reads the league's scoring (standard,
   half-PPR, PPR or 2QB) and size from Sleeper and loads the league's current season.
3. To fill in earlier years, run it again with the _seasons_ input, e.g. `2025,2024,2023`; each
   past season's keeper value then uses the ADP from that year's draft.
4. Set the **Variable** `ADP_AUTOMATION_ENABLED` = `true` to refresh weekly through draft season
   (April–September). Locally: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run fetch-adp`.

Synced rows are marked with the feed page they came from, so re-runs replace them and leave
anything typed in by hand alone. Player names are matched to Sleeper's by name, so a handful of
unusual spellings may need a manual entry.

## Development

```bash
npm install
cp .env.example .env   # fill in the Supabase URL and anon key
npm run dev            # http://localhost:5173/west-ktown-stats/
npm test               # vitest: engines, standings math, parsers, lottery screens
npm run lint && npm run typecheck && npm run format:check
npm run build          # dist/
```

## Project layout

```
supabase/schema.sql              tables, triggers (league rules), row-level security
src/lib/sleeper/                 one typed Sleeper client + response types
src/lib/players.ts               players dump, cached in IndexedDB for a day
src/context/                     auth session; league data + mutations
src/components/                  shell (Layout, SubTabs), shared widgets
src/pages/                       one folder per tab
src/features/standings/          standings math, history loader, all-time aggregates (pure)
src/features/lottery/            engine (pure), Sleeper mapping, zustand store, screens
src/features/keepers/            rules engine (pure), Sleeper assembly, boards
src/features/stats/parseTable.ts NFL.com paste parser (pure)
src/features/parlay/             odds/parlay math (pure), weeks/legs context, parlay pages
scripts/file-suggestions.mjs     suggestions -> GitHub issues
scripts/fetch-odds.mjs           The Odds API -> games / game_odds tables
scripts/fetch-adp.mjs            Fantasy Football Calculator ADP -> "ADP" stat entries (lib/ is pure)
docs/keeper-rules.md             the league's keeper rules, codified
.github/workflows/               CI + Pages deploy, suggestion filing, odds and ADP fetch
```

## Notes on the data

- Standings are recomputed from each week's matchups (regular season only), so head-to-head
  records match whether or not the league used Sleeper's median setting. Completed seasons are
  cached in `localStorage`.
- The lottery is computed up-front with a recorded seed; the results poster and the published
  draft order both show it, so anyone can replay and verify the draw.
- Manual stats are keyed by definition, season, week (0 = season total) and subject, so pasting
  an updated table overwrites the old numbers instead of duplicating them.
