/**
 * Seasons entered under League Settings → League History in the Sleeper app.
 * They are not in the public REST API; Sleeper's GraphQL endpoint serves them
 * to a signed-in user via `get_league_manual_history`. The endpoint allows
 * any origin, so the browser can ask directly with the commissioner's token.
 *
 * The exact shape of `season_standings` is Sleeper's to change, so the mapper
 * reads it by looking for likely field names and reports what it could not.
 */
import type { LegacyTeam } from '../db.ts'

export const SLEEPER_GRAPHQL_URL = 'https://sleeper.com/graphql'

export interface ManualHistorySeason {
  season: string
  league_notes?: unknown
  import_data?: Record<string, unknown> | null
  season_standings?: unknown
  top_standings?: Record<string, unknown> | null
}

export interface ImportedSeason {
  season: number
  /** Platform named in the import data, if any. */
  source: string | null
  notes: string | null
  teams: LegacyTeam[]
  /** Fields the mapper could not find, for the commissioner to fill in by hand. */
  warnings: string[]
  raw: ManualHistorySeason
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** Reads the league's manual history with a Sleeper session token. */
export async function fetchManualHistory(
  token: string,
  leagueId: string,
  fetchFn: FetchLike = fetch,
): Promise<ManualHistorySeason[]> {
  const res = await fetchFn(SLEEPER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: token.trim().replace(/^bearer\s+/i, ''),
    },
    body: JSON.stringify({
      query:
        'query ManualHistory($league_id: Snowflake!) { get_league_manual_history(league_id: $league_id) { season league_notes import_data season_standings top_standings } }',
      variables: { league_id: leagueId },
    }),
  })
  if (!res.ok) throw new Error(`Sleeper answered ${res.status}`)
  const body = (await res.json()) as {
    data?: { get_league_manual_history?: ManualHistorySeason[] | null }
    errors?: { message?: string; code?: string }[]
  }
  const error = body.errors?.[0]
  if (error) {
    throw new Error(
      error.code === 'unauthorized' || /unauthori[sz]ed/i.test(error.message ?? '')
        ? 'Sleeper did not accept that token. Copy it again from a signed-in Sleeper tab.'
        : (error.message ?? 'Sleeper returned an error'),
    )
  }
  return body.data?.get_league_manual_history ?? []
}

const KEYS = {
  teamName: ['team_name', 'teamname', 'team', 'name', 'roster_name', 'roster'],
  ownerName: [
    'owner_name',
    'owner',
    'display_name',
    'manager',
    'manager_name',
    'user_name',
    'username',
    'user',
  ],
  wins: ['wins', 'w', 'win'],
  losses: ['losses', 'l', 'loss'],
  ties: ['ties', 't', 'tie'],
  pointsFor: ['points_for', 'pointsfor', 'pf', 'fpts', 'points', 'points_scored'],
  pointsAgainst: ['points_against', 'pointsagainst', 'pa', 'fpts_against'],
  rank: ['final_rank', 'finish', 'place', 'placement', 'rank', 'standing', 'position', 'seed'],
} as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function text(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (isRecord(v)) {
    const inner = firstOf(v, ['display_name', 'name', 'team_name', 'username'])
    return typeof inner === 'string' ? inner.trim() : ''
  }
  return ''
}

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function firstOf(row: Record<string, unknown>, names: readonly string[]): unknown {
  const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]))
  for (const name of names) {
    const key = lower.get(name)
    if (key !== undefined && row[key] !== null && row[key] !== undefined && row[key] !== '')
      return row[key]
  }
  return undefined
}

/** "9-4" or "9-4-1" in a record string. */
function parseRecord(v: unknown): { wins: number; losses: number; ties: number } | null {
  if (typeof v !== 'string') return null
  const m = v.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/)
  if (!m) return null
  return { wins: Number(m[1]), losses: Number(m[2]), ties: Number(m[3] ?? 0) }
}

/** One standings row -> a team line, plus whatever was missing. */
export function mapStandingRow(
  row: unknown,
  index: number,
): { team: LegacyTeam; missing: string[] } {
  const missing: string[] = []
  const r = isRecord(row) ? row : {}
  const teamName = text(firstOf(r, KEYS.teamName))
  const ownerName = text(firstOf(r, KEYS.ownerName))
  if (!teamName && !ownerName) missing.push(`row ${index + 1}: no team or manager name`)
  const record = parseRecord(firstOf(r, ['record']))
  const wins = record ? record.wins : num(firstOf(r, KEYS.wins))
  const losses = record ? record.losses : num(firstOf(r, KEYS.losses))
  const ties = record ? record.ties : num(firstOf(r, KEYS.ties))
  if (!record && firstOf(r, KEYS.wins) === undefined && firstOf(r, KEYS.losses) === undefined)
    missing.push(`${teamName || ownerName || `row ${index + 1}`}: no record`)
  const rank = num(firstOf(r, KEYS.rank))
  return {
    team: {
      teamName,
      ownerName,
      sleeperUserId: null,
      wins,
      losses,
      ties,
      pointsFor: num(firstOf(r, KEYS.pointsFor)),
      pointsAgainst: num(firstOf(r, KEYS.pointsAgainst)),
      playoffFinish: rank > 0 ? Math.round(rank) : null,
    },
    missing,
  }
}

/**
 * Playoff finishes from `top_standings` when it names places, e.g.
 * { "1": "Team A", "2": {...} } or { champion: "Team A", runner_up: "Team B" }.
 */
function finishesFromTop(top: Record<string, unknown> | null | undefined): Map<string, number> {
  const out = new Map<string, number>()
  if (!top) return out
  const named: Record<string, number> = {
    champion: 1,
    winner: 1,
    first: 1,
    runner_up: 2,
    runnerup: 2,
    second: 2,
    third: 3,
  }
  for (const [key, value] of Object.entries(top)) {
    const k = key.toLowerCase().replace(/[\s-]/g, '_')
    const place = named[k] ?? (/^\d+$/.test(k) ? Number(k) : null)
    if (!place) continue
    const name = text(value)
    if (name) out.set(name.toLowerCase(), place)
  }
  return out
}

/** Every season Sleeper holds, as rows for the past-seasons table. */
export function mapManualHistory(seasons: readonly ManualHistorySeason[]): ImportedSeason[] {
  const out: ImportedSeason[] = []
  for (const raw of seasons) {
    const year = Number(raw.season)
    if (!Number.isInteger(year)) continue
    const warnings: string[] = []
    const rows = Array.isArray(raw.season_standings) ? raw.season_standings : []
    if (rows.length === 0) warnings.push('no standings rows in this season')
    const teams: LegacyTeam[] = []
    rows.forEach((row, i) => {
      const { team, missing } = mapStandingRow(row, i)
      warnings.push(...missing)
      teams.push(team)
    })
    // Sleeper may store the final order rather than a rank field: fall back to row order
    // when no row carried a finish and the rows look ordered by record.
    const finishes = finishesFromTop(raw.top_standings)
    for (const t of teams) {
      if (t.playoffFinish !== null) continue
      const place =
        finishes.get(t.teamName.toLowerCase()) ?? finishes.get(t.ownerName.toLowerCase())
      if (place) t.playoffFinish = place
    }
    const importData = isRecord(raw.import_data) ? raw.import_data : {}
    const source = text(firstOf(importData, ['provider', 'platform', 'source', 'site']))
    const notes = Array.isArray(raw.league_notes)
      ? raw.league_notes.map(text).filter(Boolean).join(' · ')
      : text(raw.league_notes)
    out.push({
      season: year,
      source: source || 'Sleeper League History',
      notes: notes || null,
      teams,
      warnings,
      raw,
    })
  }
  return out.sort((a, b) => b.season - a.season)
}
