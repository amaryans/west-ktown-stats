// Fetch NFL odds from The Odds API and upsert them into Supabase.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ODDS_API_KEY=... node scripts/fetch-odds.mjs
//
// Cost: one request with three markets for one region = 3 credits. The free
// tier (500/month) covers the scheduled runs in .github/workflows/fetch-odds.yml
// many times over.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ODDS_API_KEY = process.env.ODDS_API_KEY

if (!SUPABASE_URL || !SERVICE_KEY || !ODDS_API_KEY) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or ODDS_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Same week math as src/features/parlay/lib/week.ts: weeks run Tuesday -> Monday, and
// season_start is the Week 1 Thursday.
function nflWeekFor(date, seasonStart) {
  const [y, m, d] = seasonStart.split('-').map(Number)
  const tuesday = Date.UTC(y, m - 1, d - 2)
  const week = Math.floor((date.getTime() - tuesday) / (7 * 86_400_000)) + 1
  return Math.min(22, Math.max(1, week))
}

async function main() {
  const { data: settings, error: settingsError } = await supabase
    .from('league_settings')
    .select('season, season_start')
    .eq('id', 1)
    .single()
  if (settingsError) throw settingsError

  const url = new URL('https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds')
  url.searchParams.set('apiKey', ODDS_API_KEY)
  url.searchParams.set('regions', 'us')
  url.searchParams.set('markets', 'h2h,spreads,totals')
  url.searchParams.set('oddsFormat', 'american')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${await res.text()}`)
  const events = await res.json()
  console.log(
    `Fetched ${events.length} events. Requests remaining: ${res.headers.get('x-requests-remaining')}`,
  )

  const now = new Date()
  const currentWeek = nflWeekFor(now, settings.season_start)
  let gamesUpserted = 0
  let oddsUpserted = 0

  for (const ev of events) {
    const commence = new Date(ev.commence_time)
    const week = nflWeekFor(commence, settings.season_start)
    // Only keep this week and next; avoids dragging in look-ahead lines.
    if (week < currentWeek || week > currentWeek + 1) continue

    const { data: game, error: gameError } = await supabase
      .from('games')
      .upsert(
        {
          event_id: ev.id,
          season: settings.season,
          week,
          commence_time: ev.commence_time,
          home_team: ev.home_team,
          away_team: ev.away_team,
          updated_at: now.toISOString(),
        },
        { onConflict: 'event_id' },
      )
      .select('id')
      .single()
    if (gameError) throw gameError
    gamesUpserted += 1

    const rows = []
    for (const bk of ev.bookmakers || []) {
      for (const mk of bk.markets || []) {
        if (!['h2h', 'spreads', 'totals'].includes(mk.key)) continue
        for (const oc of mk.outcomes || []) {
          rows.push({
            game_id: game.id,
            bookmaker: bk.key,
            market: mk.key,
            outcome: oc.name,
            point: oc.point ?? null,
            price: Math.round(oc.price),
            fetched_at: now.toISOString(),
          })
        }
      }
    }
    if (rows.length) {
      const { error: oddsError } = await supabase
        .from('game_odds')
        .upsert(rows, { onConflict: 'game_id,bookmaker,market,outcome' })
      if (oddsError) throw oddsError
      oddsUpserted += rows.length
    }
  }

  console.log(
    `Upserted ${gamesUpserted} games and ${oddsUpserted} odds rows for weeks ${currentWeek}-${currentWeek + 1}.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
