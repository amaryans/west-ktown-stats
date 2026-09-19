/**
 * Seasons from before the league was on Sleeper: final standings typed in by
 * the commissioner (Settings → Past seasons). They carry a record, points and
 * a playoff finish per team but no weekly matchups, so there is no games-vs-
 * median split and no best week. They are folded into the league history so
 * the standings, all-time table and team histories show the whole run.
 */
import type { LegacySeason, LegacyTeam } from '../../lib/db.ts'
import type { LeagueHistory, SeasonStandings } from './history.ts'
import { rank, type RecordLine, type SeasonTeam } from './standings.ts'

/** Owner id for a manager who never had a Sleeper account: stable across seasons by name. */
export function legacyOwnerId(ownerName: string): string {
  return `legacy:${ownerName.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

export function legacyLeagueId(season: number): string {
  return `legacy:${season}`
}

function line(t: LegacyTeam): RecordLine {
  return { wins: t.wins || 0, losses: t.losses || 0, ties: t.ties || 0 }
}

/** One hand-entered season in the same shape as a Sleeper season. */
export function legacySeasonStandings(legacy: LegacySeason): SeasonStandings {
  const teams: SeasonTeam[] = legacy.teams.map((t, i) => ({
    rosterId: i + 1,
    ownerId: t.sleeperUserId || (t.ownerName.trim() ? legacyOwnerId(t.ownerName) : null),
    ownerName: t.ownerName.trim() || t.teamName.trim() || `Team ${i + 1}`,
    teamName: t.teamName.trim() || t.ownerName.trim() || `Team ${i + 1}`,
    avatar: null,
    teamAvatarUrl: null,
    h2h: line(t),
    median: { wins: 0, losses: 0, ties: 0 },
    combined: line(t),
    pointsFor: t.pointsFor || 0,
    pointsAgainst: t.pointsAgainst || 0,
    weekly: [],
  }))
  const placements: Record<number, number> = {}
  let champion: number | null = null
  legacy.teams.forEach((t, i) => {
    if (t.playoffFinish && t.playoffFinish > 0) {
      placements[i + 1] = t.playoffFinish
      if (t.playoffFinish === 1) champion = i + 1
    }
  })
  return {
    leagueId: legacyLeagueId(legacy.season),
    season: String(legacy.season),
    name: legacy.source?.trim() ? `${legacy.source.trim()} league` : 'Pre-Sleeper season',
    status: 'complete',
    medianEnabled: false,
    playoffWeekStart: null,
    weeksPlayed: [],
    champion,
    placements,
    teams,
    complete: true,
    source: 'manual',
    sourceName: legacy.source?.trim() || null,
  }
}

/**
 * The Sleeper history plus every hand-entered season, newest first. A
 * hand-entered season for a year Sleeper already covers is ignored, so the
 * Sleeper data always wins.
 */
export function withLegacySeasons(
  history: LeagueHistory,
  legacy: readonly LegacySeason[],
): LeagueHistory {
  if (legacy.length === 0) return history
  const covered = new Set(history.seasons.map((s) => s.season))
  const extra = legacy
    .filter((l) => !covered.has(String(l.season)))
    .map((l) => legacySeasonStandings(l))
  if (extra.length === 0) return history
  return {
    ...history,
    seasons: [...history.seasons, ...extra].sort((a, b) => Number(b.season) - Number(a.season)),
  }
}

/** Final order of a hand-entered season: record, then points for (what the table shows). */
export function legacyRanked(legacy: LegacySeason) {
  return rank(legacySeasonStandings(legacy).teams, 'h2h')
}

/** Every manager seen across the history, for picking who a past team belonged to. */
export function knownManagers(
  history: LeagueHistory | null,
): { ownerId: string; ownerName: string; sleeper: boolean }[] {
  const seen = new Map<string, { ownerId: string; ownerName: string; sleeper: boolean }>()
  for (const season of history?.seasons ?? []) {
    for (const t of season.teams) {
      if (!t.ownerId || seen.has(t.ownerId)) continue
      seen.set(t.ownerId, {
        ownerId: t.ownerId,
        ownerName: t.ownerName,
        sleeper: !t.ownerId.startsWith('legacy:'),
      })
    }
  }
  return [...seen.values()].sort((a, b) => a.ownerName.localeCompare(b.ownerName))
}
