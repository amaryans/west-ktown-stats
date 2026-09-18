# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

West K-Town Fantasy Football's league site: a React 19 + TypeScript + Vite single-page app on
GitHub Pages, with Supabase (Postgres + auth + RLS) as the only backend and Sleeper's public API
for league data. It consolidates the standings-history site, the draft lottery, the keepers list
and the parlay tracker's login/team-claiming structure. See README.md for setup.

## Commands

```bash
npm run dev          # Vite dev server (base path /west-ktown-stats/, HashRouter)
npm test             # Vitest (jsdom): engines, standings math, parsers, lottery screens
npm run lint         # ESLint flat config (purity boundaries below)
npm run typecheck    # tsc -b --noEmit (strict, noUncheckedIndexedAccess)
npm run format       # Prettier
npm run build        # tsc + vite build -> dist/
```

## Architecture

- **Routing:** `HashRouter`. Tabs: `/preseason/*`, `/stats/*`, `/history`, `/team`, `/parlay/*`,
  `/settings/*`.
  `App.tsx` shows Login/Signup when signed out, otherwise `Layout` (top bar + tab strip; a fixed
  bottom tab bar under 640px) around the pages.
- **Data:** `context/AuthContext` (Supabase session) and `context/LeagueContext` (settings,
  profiles, published data, stat tables + every mutation; reloads after each write). The Sleeper
  current season loads eagerly; the full multi-season history loads lazily via `history.load()`.
- **Sleeper:** one client in `src/lib/sleeper/client.ts` (injectable `fetchFn` for tests). The
  lottery and keepers features import it rather than carrying their own.
- **Features** (`src/features/*`) are self-contained; pages compose them:
  - `standings/` — `standings.ts` (pure math), `history.ts` (loader + localStorage cache),
    `alltime.ts` (career aggregates), `SeasonTable.tsx`.
  - `lottery/` — `engine/` (pure, seedable), `data/` (mapping, seeding), `state/store.ts`
    (zustand, persisted as `ffl.v1`), `screens/`, `LotteryApp.tsx` (phase switch + step nav).
    Tailwind classes are used only here; the rest of the site uses the CSS in `src/index.css`.
  - `keepers/` — `engine/` (pure rules), `api/assemble.ts`, `KeepersApp.tsx`.
  - `stats/parseTable.ts` — parser for tables pasted from NFL.com.
  - `parlay/` — `lib/` (odds, week, board and stats math, pure), `ParlayContext.tsx` (weeks,
    legs, games + mutations, layered on `LeagueContext`), `components/`, `pages/`. Ported from
    fantasy-parlay-tracker; the database triggers enforce the house rules, not the UI.
- **CSS:** `src/index.css` imports Tailwind, then puts element defaults in `@layer base` and
  site classes in `@layer components` so Tailwind utilities can still override them. Dark only.

## Module boundaries (ESLint `no-restricted-imports`)

- `features/lottery/engine/**` and `features/keepers/engine/**`: no React, no fetch, no
  `Math.random` / `Date.now`.
- `src/lib/**`, `features/standings/*.ts`, `features/lottery/data/**`, `features/keepers/api/**`:
  framework-free (no React or UI imports). `features/parlay/lib/**` follows the same rule.

## Database

`supabase/schema.sql` is the source of truth. Sections 1–2 are the login structure shared with the
parlay tracker (`league_settings`, `profiles`, invite code trigger, commissioner role); section 3
holds the parlay tracker's tables unchanged; section 4 is this site's (`draft_orders`,
`keeper_lists`, `stat_suggestions`, `stat_definitions`, `stat_entries`). Row types live in
`src/lib/db.ts`. Every table is RLS-protected: members read everything, commissioners write shared
data, members write their own suggestions/stat entries.

## Key invariants

- Lottery odds basis points sum to exactly 10000; team count 2–16; the draw is computed at "Start
  Lottery" with a recorded seed and the event screen is theater over a fixed result.
- Standings are recomputed from weekly matchups (regular season only); completed seasons are cached.
- `stat_entries` are unique per (definition, season, week, subject); week 0 = season total.
- One member per Sleeper team (`profiles_sleeper_user_idx`). `profiles.id` is the auth user id for
  real members and a random uuid for placeholders (`is_placeholder`); `merge_placeholder_member`
  folds a placeholder into the account that claims its Sleeper team (on signup or profile update),
  and the house-rule triggers stand aside while `app.merging` is on.
- Existing databases take changes through `supabase/migrations/`; `schema.sql` stays the full,
  fresh-install version and must include everything the migrations add.

## Testing

Pure modules have unit tests next to them (`*.test.ts`); keepers tests live in
`features/keepers/__tests__` with hand-authored Sleeper fixtures. Lottery screen tests use RTL and
fake only the `setTimeout` family (framer-motion needs real rAF). Pages that talk to Supabase are
not unit-tested; they were checked with a Playwright run against mocked Supabase/Sleeper responses.
