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
    console.log('league keys:', Object.keys(league).join(', '))
    const { scoring_settings, roster_positions, settings, ...rest } = league
    console.log('league (without scoring/positions/settings):', JSON.stringify(rest))
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
        const meta = Object.fromEntries(
          Object.entries(r.metadata ?? {}).filter(([k]) => !k.startsWith('p_nick_')),
        )
        console.log(
          `  #${r.roster_id} owner=${r.owner_id} (${u?.display_name ?? '?'}) players=${r.players?.length ?? 0}`,
          JSON.stringify(r.settings ?? null),
          Object.keys(meta).length ? `metadata=${JSON.stringify(meta)}` : '',
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

  // Where else Sleeper might keep history added from another platform.
  const first = [...seen][0]
  console.log(`\n=== probes for ${first}`)
  for (const path of [
    'history',
    'legacy',
    'legacy_leagues',
    'legacy_history',
    'past_seasons',
    'previous_seasons',
    'seasons',
    'trophies',
    'champions',
    'records',
    'hall_of_fame',
    'winners',
    'losers_bracket',
  ]) {
    const res = await fetch(`${BASE}/league/${first}/${path}`)
    const text = await res.text()
    console.log(`  /league/{id}/${path}: ${res.status} ${text.slice(0, 400)}`)
  }
  for (const url of [
    `https://api.sleeper.app/v1/league/${first}/history`,
    `https://api.sleeper.com/league/${first}/history`,
    `https://api.sleeper.com/leagues/${first}/history`,
    `https://api.sleeper.com/league/${first}`,
  ]) {
    const res = await fetch(url).catch((e) => ({ status: e.message, text: async () => '' }))
    console.log(`  ${url}: ${res.status} ${(await res.text()).slice(0, 400)}`)
  }
  // GraphQL, which the Sleeper apps use: does introspection name a history type?
  try {
    const res = await fetch('https://sleeper.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: '{ __schema { queryType { fields { name } } types { name } } }',
      }),
    })
    const text = await res.text()
    const words = [
      ...text.matchAll(/"name":"([^"]*(?:histor|legacy|past|season|trophy|champ|record)[^"]*)"/gi),
    ].map((m) => m[1])
    console.log(`  graphql introspection: ${res.status} matches=${[...new Set(words)].join(', ')}`)
    console.log(`  graphql first 600 chars: ${text.slice(0, 600)}`)
  } catch (err) {
    console.log(`  graphql: ${err.message}`)
  }

  // Other leagues on the commissioner's account for earlier years (unlinked old seasons?).
  const commissioner = process.env.SLEEPER_USER_ID || '984533936225239040'
  console.log(`\n=== leagues for user ${commissioner} by season`)
  for (let year = 2010; year <= 2023; year++) {
    const leagues = await get(`/user/${commissioner}/leagues/nfl/${year}`).catch(() => [])
    if (!Array.isArray(leagues) || leagues.length === 0) continue
    for (const l of leagues) {
      console.log(
        `  ${year}: ${l.league_id} · ${l.name} · ${l.status} · ${l.total_rosters} teams · prev=${l.previous_league_id}`,
      )
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
