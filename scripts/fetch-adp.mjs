#!/usr/bin/env node
/**
 * Syncs average draft position (ADP) into the "ADP" manual stat from Fantasy
 * Football Calculator's free feed, so the Team tab's keeper value uses real
 * draft data instead of Sleeper's player rank. Runs in GitHub Actions (see
 * .github/workflows/fetch-adp.yml) or locally:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run fetch-adp
 *
 * Optional environment:
 *   ADP_SEASONS   comma-separated years to (re)load, e.g. "2026,2025,2024".
 *                 Default: the league's season, plus the current year once
 *                 spring mock drafts have started. Use it to backfill.
 *   ADP_FORMAT    standard | half-ppr | ppr | 2qb (default: read from the
 *                 Sleeper league's scoring settings)
 *   ADP_TEAMS     8 | 10 | 12 | 14 (default: the Sleeper league's size)
 *
 * The service-role key bypasses row security, so it must never ship to the
 * browser. Idempotent: rows are keyed by (definition, season, week 0, player),
 * and players who drop out of the feed are removed from the synced rows only;
 * anything typed in by hand is left alone.
 */
import { createClient } from '@supabase/supabase-js'
import {
  FFC_FORMATS,
  FFC_SOURCE_PREFIX,
  adpApiUrl,
  adpPageUrl,
  entriesFromAdp,
  formatForLeague,
  nearestTeamSize,
  seasonsToSync,
} from './lib/adp.mjs'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADP_SEASONS, ADP_FORMAT, ADP_TEAMS } = process.env

function need(name, value) {
  if (!value) {
    console.error(`Missing ${name}`)
    process.exit(1)
  }
  return value
}

const supabase = createClient(
  need('SUPABASE_URL', SUPABASE_URL),
  need('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY),
  { auth: { persistSession: false } },
)

async function fetchJson(url, what) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${what} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/** The stat definition the keeper value view looks for: a key or label mentioning ADP. */
async function ensureDefinition() {
  const { data: defs, error } = await supabase
    .from('stat_definitions')
    .select('id, key, label')
    .order('created_at')
  if (error) throw error
  const existing = defs.find((d) => /\badp\b/i.test(d.label) || /adp/i.test(d.key))
  if (existing) return existing
  const { data: created, error: insertError } = await supabase
    .from('stat_definitions')
    .insert({
      key: 'adp',
      label: 'ADP',
      description:
        'Average draft position (overall pick) from Fantasy Football Calculator mock drafts, ' +
        'synced automatically. Used by the Team tab’s keeper value.',
      unit: 'pick',
      scope: 'player',
    })
    .select('id, key, label')
    .single()
  if (insertError) throw insertError
  console.log('Created the "ADP" stat definition.')
  return created
}

/** Scoring format and league size from Sleeper, unless overridden. */
async function leagueShape(sleeperLeagueId) {
  let format = ADP_FORMAT?.trim().toLowerCase() || null
  let teams = ADP_TEAMS ? Number(ADP_TEAMS) : null
  if ((!format || !teams) && sleeperLeagueId) {
    try {
      const league = await fetchJson(
        `https://api.sleeper.app/v1/league/${sleeperLeagueId}`,
        'Sleeper',
      )
      format ??= formatForLeague(league)
      teams ??= league.total_rosters
    } catch (err) {
      console.warn(`Could not read the Sleeper league (${err.message}); using defaults.`)
    }
  }
  format ??= 'ppr'
  if (!FFC_FORMATS.includes(format)) {
    throw new Error(`ADP_FORMAT must be one of ${FFC_FORMATS.join(', ')}, got "${format}"`)
  }
  return { format, teams: nearestTeamSize(teams ?? 12) }
}

async function syncSeason({ season, format, teams, definition }) {
  const sourceUrl = adpPageUrl(format, teams, season)
  const payload = await fetchJson(adpApiUrl(format, teams, season), 'Fantasy Football Calculator')
  if (payload?.status && payload.status !== 'Success') {
    console.warn(`${season}: feed answered "${payload.status}"; skipping.`)
    return
  }
  const rows = entriesFromAdp(payload, { definitionId: definition.id, season, sourceUrl })
  if (rows.length === 0) {
    console.warn(`${season}: no ADP published yet for ${teams}-team ${format}; skipping.`)
    return
  }

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from('stat_entries')
      .upsert(rows.slice(i, i + 200), { onConflict: 'definition_id,season,week,subject' })
    if (error) throw error
  }

  // Drop synced players who fell out of the feed; hand-entered rows have other sources.
  const { data: existing, error: readError } = await supabase
    .from('stat_entries')
    .select('id, subject')
    .eq('definition_id', definition.id)
    .eq('season', season)
    .eq('week', 0)
    .like('source_url', `${FFC_SOURCE_PREFIX}%`)
  if (readError) throw readError
  const keep = new Set(rows.map((r) => r.subject))
  const stale = existing.filter((e) => !keep.has(e.subject)).map((e) => e.id)
  if (stale.length) {
    const { error: deleteError } = await supabase.from('stat_entries').delete().in('id', stale)
    if (deleteError) throw deleteError
  }

  const meta = payload?.meta ?? {}
  const sample = meta.total_drafts ? ` from ${meta.total_drafts} drafts` : ''
  const window = meta.start_date && meta.end_date ? ` (${meta.start_date} to ${meta.end_date})` : ''
  console.log(
    `${season}: ${rows.length} players${sample}${window}; removed ${stale.length} stale. ${sourceUrl}`,
  )
}

async function main() {
  const { data: settings, error } = await supabase
    .from('league_settings')
    .select('season, sleeper_league_id')
    .eq('id', 1)
    .single()
  if (error) throw error

  const { format, teams } = await leagueShape(settings.sleeper_league_id)
  const seasons = seasonsToSync({
    explicit: ADP_SEASONS,
    leagueSeason: settings.season,
    today: new Date(),
  })
  console.log(`Syncing ${teams}-team ${format} ADP for ${seasons.join(', ')}.`)

  const definition = await ensureDefinition()
  const failures = []
  for (const season of seasons) {
    try {
      await syncSeason({ season, format, teams, definition })
    } catch (err) {
      failures.push(season)
      console.error(`${season}: ${err.message ?? err}`)
    }
  }
  if (failures.length) throw new Error(`ADP sync failed for ${failures.join(', ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
