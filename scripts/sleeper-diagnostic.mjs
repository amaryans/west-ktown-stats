#!/usr/bin/env node
/**
 * Prints what Sleeper returns for every season in the league's chain, so a
 * season that shows up wrong on the site can be diagnosed from the Actions
 * log. Reads the league id from Supabase (or SLEEPER_LEAGUE_ID). Everything
 * printed is public Sleeper data.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run sleeper-diagnostic
 */
import { createClient } from '@supabase/supabase-js'

const BASE = 'https://api.sleeper.app/v1'

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function leagueId() {
  if (process.env.SLEEPER_LEAGUE_ID) return process.env.SLEEPER_LEAGUE_ID
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase
    .from('league_settings')
    .select('sleeper_league_id')
    .eq('id', 1)
    .single()
  if (error) throw error
  return data.sleeper_league_id
}

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k]]))

async function main() {
  let id = await leagueId()
  const seen = new Set()
  while (id && !seen.has(id) && seen.size < 30) {
    seen.add(id)
    let league
    try {
      league = await get(`/league/${id}`)
    } catch (err) {
      console.log(`\n=== ${id}: ${err.message}`)
      break
    }
    console.log(`\n=== ${league.season} · ${league.name} · ${league.league_id}`)
    console.log(
      JSON.stringify(
        pick(league, ['status', 'previous_league_id', 'draft_id', 'total_rosters', 'season_type']),
      ),
    )
    console.log('metadata:', JSON.stringify(league.metadata ?? null))
    console.log(
      'settings:',
      JSON.stringify(
        pick(league.settings ?? {}, [
          'playoff_week_start',
          'league_average_match',
          'playoff_teams',
          'num_teams',
          'last_scored_leg',
          'leg',
        ]),
      ),
    )
    const [rosters, users] = await Promise.all([
      get(`/league/${id}/rosters`).catch((e) => e.message),
      get(`/league/${id}/users`).catch((e) => e.message),
    ])
    if (Array.isArray(rosters)) {
      console.log(`rosters: ${rosters.length}`)
      for (const r of rosters) {
        const u = Array.isArray(users) ? users.find((x) => x.user_id === r.owner_id) : null
        console.log(
          `  #${r.roster_id} owner=${r.owner_id} (${u?.display_name ?? '?'}) players=${r.players?.length ?? 0}`,
          JSON.stringify(r.settings ?? null),
          r.metadata ? `metadata=${JSON.stringify(r.metadata)}` : '',
        )
      }
    } else console.log('rosters:', rosters)
    const weeks = []
    for (const w of [1, 2, 8, 14, 15, 17]) {
      const m = await get(`/league/${id}/matchups/${w}`).catch(() => null)
      const scored = Array.isArray(m) ? m.filter((x) => Number(x.points) > 0).length : 'err'
      weeks.push(`w${w}:${Array.isArray(m) ? m.length : 'err'}/${scored}`)
    }
    console.log('matchups (rows/scored):', weeks.join(' '))
    const bracket = await get(`/league/${id}/winners_bracket`).catch((e) => e.message)
    console.log('winners_bracket:', Array.isArray(bracket) ? JSON.stringify(bracket) : bracket)
    const drafts = await get(`/league/${id}/drafts`).catch((e) => e.message)
    console.log(
      'drafts:',
      Array.isArray(drafts)
        ? JSON.stringify(drafts.map((d) => pick(d, ['draft_id', 'status', 'type', 'season'])))
        : drafts,
    )
    id = league.previous_league_id
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
