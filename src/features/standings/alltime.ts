/**
 * Cross-season aggregates derived from the league history: one row per owner
 * (Sleeper user id) with career totals, and one row per owner per season.
 */
import { isChampion, titleShared, type LeagueHistory, type SeasonStandings } from './history.ts'
import { addLines, rank, winPct, type RecordLine, type SeasonTeam } from './standings.ts'

export interface OwnerSeason {
  season: string
  leagueId: string
  rosterId: number
  teamName: string
  ownerName: string
  h2h: RecordLine
  median: RecordLine
  combined: RecordLine
  pointsFor: number
  pointsAgainst: number
  /** Regular-season rank by head-to-head record. */
  rank: number
  /** Regular-season rank counting games vs. the median. */
  rankCombined: number
  teamCount: number
  playoffFinish: number | null
  champion: boolean
  /** Champion of a season whose title was split. */
  sharedTitle: boolean
  complete: boolean
  weekly: SeasonTeam['weekly']
}

export interface OwnerCareer {
  ownerId: string
  ownerName: string
  latestTeamName: string
  avatarSrc: { avatar: string | null; teamAvatarUrl: string | null }
  seasons: OwnerSeason[]
  seasonsPlayed: number
  h2h: RecordLine
  median: RecordLine
  combined: RecordLine
  winPct: number
  pointsFor: number
  pointsAgainst: number
  championships: number
  /** Championships that were shared with another team. */
  sharedTitles: number
  playoffAppearances: number
  bestFinish: number | null
  averageRank: number | null
  highestWeek: { season: string; week: number; points: number } | null
}

function emptyLine(): RecordLine {
  return { wins: 0, losses: 0, ties: 0 }
}

/** Per-owner season rows, newest first. Orphan rosters (no owner) are skipped. */
export function ownerSeasons(history: LeagueHistory): Map<string, OwnerSeason[]> {
  const byOwner = new Map<string, OwnerSeason[]>()
  for (const season of history.seasons) {
    const h2hRank = new Map(rank(season.teams, 'h2h').map((t) => [t.rosterId, t.rank]))
    const combinedRank = new Map(rank(season.teams, 'combined').map((t) => [t.rosterId, t.rank]))
    for (const team of season.teams) {
      if (!team.ownerId) continue
      const rows = byOwner.get(team.ownerId) ?? []
      rows.push({
        season: season.season,
        leagueId: season.leagueId,
        rosterId: team.rosterId,
        teamName: team.teamName,
        ownerName: team.ownerName,
        h2h: team.h2h,
        median: team.median,
        combined: team.combined,
        pointsFor: team.pointsFor,
        pointsAgainst: team.pointsAgainst,
        rank: h2hRank.get(team.rosterId) ?? 0,
        rankCombined: combinedRank.get(team.rosterId) ?? 0,
        teamCount: season.teams.length,
        playoffFinish: season.placements?.[team.rosterId] ?? null,
        champion: isChampion(season, team.rosterId),
        sharedTitle: isChampion(season, team.rosterId) && titleShared(season),
        complete: season.complete,
        weekly: team.weekly,
      })
      byOwner.set(team.ownerId, rows)
    }
  }
  return byOwner
}

/** Career totals per owner, sorted by win percentage then points for. */
export function careers(history: LeagueHistory): OwnerCareer[] {
  const out: OwnerCareer[] = []
  for (const [ownerId, seasons] of ownerSeasons(history)) {
    const played = seasons.filter((s) => s.h2h.wins + s.h2h.losses + s.h2h.ties > 0)
    const h2h = played.reduce((acc, s) => addLines(acc, s.h2h), emptyLine())
    const median = played.reduce((acc, s) => addLines(acc, s.median), emptyLine())
    const finishes = played.map((s) => s.playoffFinish).filter((f): f is number => f !== null)
    const ranks = played.filter((s) => s.complete).map((s) => s.rank)
    let highestWeek: OwnerCareer['highestWeek'] = null
    for (const s of played) {
      for (const w of s.weekly) {
        if (!highestWeek || w.points > highestWeek.points) {
          highestWeek = { season: s.season, week: w.week, points: w.points }
        }
      }
    }
    const latest = seasons[0]
    const latestTeam = latestSeasonTeam(history, ownerId)
    if (!latest) continue
    out.push({
      ownerId,
      ownerName: latest.ownerName,
      latestTeamName: latest.teamName,
      avatarSrc: {
        avatar: latestTeam?.avatar ?? null,
        teamAvatarUrl: latestTeam?.teamAvatarUrl ?? null,
      },
      seasons,
      seasonsPlayed: played.length,
      h2h,
      median,
      combined: addLines(h2h, median),
      winPct: winPct(h2h),
      pointsFor: Math.round(played.reduce((sum, s) => sum + s.pointsFor, 0) * 100) / 100,
      pointsAgainst: Math.round(played.reduce((sum, s) => sum + s.pointsAgainst, 0) * 100) / 100,
      championships: played.filter((s) => s.champion).length,
      sharedTitles: played.filter((s) => s.sharedTitle).length,
      playoffAppearances: finishes.length,
      bestFinish: finishes.length ? Math.min(...finishes) : null,
      averageRank: ranks.length
        ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10
        : null,
      highestWeek,
    })
  }
  return out.sort(
    (a, b) => b.championships - a.championships || b.winPct - a.winPct || b.pointsFor - a.pointsFor,
  )
}

function latestSeasonTeam(history: LeagueHistory, ownerId: string): SeasonTeam | undefined {
  for (const season of history.seasons) {
    const team = season.teams.find((t) => t.ownerId === ownerId)
    if (team) return team
  }
  return undefined
}

/** The season row for one owner in one season, if they were in the league. */
export function seasonForOwner(season: SeasonStandings, ownerId: string): SeasonTeam | undefined {
  return season.teams.find((t) => t.ownerId === ownerId)
}
