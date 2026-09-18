/**
 * Pure helpers for the ADP sync (scripts/fetch-adp.mjs): choosing the Fantasy
 * Football Calculator feed that matches the league, and turning its response
 * into stat_entries rows. No network, no database, so it can be unit-tested.
 *
 * Fantasy Football Calculator publishes ADP from its mock drafts for free,
 * without a key: https://fantasyfootballcalculator.com/api/v1/adp/{format}
 * with ?teams=8|10|12|14 and ?year=YYYY. Historical years are available, so
 * past seasons can be backfilled.
 */

export const FFC_BASE = 'https://fantasyfootballcalculator.com'
export const FFC_FORMATS = ['standard', 'half-ppr', 'ppr', '2qb', 'dynasty', 'rookie']
export const FFC_TEAM_SIZES = [8, 10, 12, 14]

/** How the sync marks its own rows, so re-runs can replace them and leave hand-typed ones alone. */
export const FFC_SOURCE_PREFIX = `${FFC_BASE}/adp/`

/** Sleeper team code -> the defense's name as Sleeper's player database spells it. */
const DEFENSE_NAMES = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',
  LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
}

/** Team codes other sites use for the same clubs (including relocated ones in old seasons). */
const TEAM_ALIASES = {
  JAC: 'JAX',
  WSH: 'WAS',
  LA: 'LAR',
  STL: 'LAR',
  SD: 'LAC',
  OAK: 'LV',
  GNB: 'GB',
  KAN: 'KC',
  NWE: 'NE',
  NOR: 'NO',
  SFO: 'SF',
  TAM: 'TB',
}

export function canonicalTeam(code) {
  const upper = String(code ?? '').toUpperCase()
  return TEAM_ALIASES[upper] ?? upper
}

/**
 * The feed that best matches a Sleeper league: points per reception decide
 * standard / half-PPR / PPR, and a second starting quarterback (or a
 * superflex slot) means 2QB drafts.
 */
export function formatForLeague(league) {
  const positions = league?.roster_positions ?? []
  const qbSlots = positions.filter((p) => p === 'QB' || p === 'SUPER_FLEX').length
  if (qbSlots >= 2) return '2qb'
  const rec = Number(league?.scoring_settings?.rec ?? 0)
  if (rec >= 1) return 'ppr'
  if (rec > 0) return 'half-ppr'
  return 'standard'
}

/** The nearest league size the feed publishes (8, 10, 12 or 14 teams). */
export function nearestTeamSize(teams) {
  const n = Number(teams)
  if (!Number.isFinite(n)) return 12
  return FFC_TEAM_SIZES.reduce((best, size) =>
    Math.abs(size - n) < Math.abs(best - n) ? size : best,
  )
}

export function adpApiUrl(format, teams, season) {
  const url = new URL(`${FFC_BASE}/api/v1/adp/${format}`)
  url.searchParams.set('teams', String(teams))
  url.searchParams.set('year', String(season))
  return url.toString()
}

/** The human-readable page for the same table, stored as each row's source. */
export function adpPageUrl(format, teams, season) {
  return `${FFC_SOURCE_PREFIX}${format}/${teams}-team/all/${season}`
}

/** Player name as the site's other Sleeper-based views spell it (defenses by city and nickname). */
export function subjectFor(player) {
  const name = String(player.name ?? '').trim()
  if (String(player.position ?? '').toUpperCase() === 'DEF') {
    const team = canonicalTeam(player.team)
    return DEFENSE_NAMES[team] ?? name
  }
  return name
}

/**
 * Rows for stat_entries from one feed response. Week 0 is the season total,
 * which is the only week ADP has; the note keeps position, team and sample
 * size for the manual-stats browser.
 */
export function entriesFromAdp(payload, { definitionId, season, sourceUrl }) {
  const players = Array.isArray(payload?.players) ? payload.players : []
  const rows = []
  const seen = new Set()
  for (const p of players) {
    const subject = subjectFor(p)
    const adp = Number(p.adp)
    if (!subject || !Number.isFinite(adp) || adp <= 0) continue
    // A name can repeat (two players sharing it, or a defense listed twice);
    // keep the earlier pick, which is the one anyone means.
    if (seen.has(subject)) continue
    seen.add(subject)
    const bits = [p.position, canonicalTeam(p.team)].filter(Boolean)
    const drafted = Number(p.times_drafted)
    if (Number.isFinite(drafted) && drafted > 0) bits.push(`${drafted} drafts`)
    if (p.adp_formatted) bits.push(`round ${p.adp_formatted}`)
    rows.push({
      definition_id: definitionId,
      season,
      week: 0,
      subject,
      value: Math.round(adp * 10) / 10,
      note: bits.join(' · ') || null,
      source_url: sourceUrl,
      entered_by: null,
    })
  }
  return rows.sort((a, b) => a.value - b.value)
}

/** Seasons to sync: the explicit list if given, else the league's season plus this year when later. */
export function seasonsToSync({ explicit, leagueSeason, today }) {
  const parsed = String(explicit ?? '')
    .split(/[\s,]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 2007 && n <= 2100)
  if (parsed.length) return [...new Set(parsed)].sort((a, b) => b - a)
  const seasons = new Set()
  if (Number.isInteger(leagueSeason)) seasons.add(leagueSeason)
  // Mock drafts for the next season start in spring; the feed is empty before then.
  if (today.getUTCMonth() >= 3) seasons.add(today.getUTCFullYear())
  if (seasons.size === 0) seasons.add(today.getUTCFullYear())
  return [...seasons].sort((a, b) => b - a)
}
