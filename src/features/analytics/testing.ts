/* Fixtures for the analytics tests: seasons built through the real standings math. */
import type { LeagueHistory, SeasonStandings } from '../standings/history.ts'
import { computeSeason } from '../standings/standings.ts'

/** weeks[w] = [[rosterA, pointsA, rosterB, pointsB], ...] */
export type Week = [number, number, number, number][]

export function makeSeason(
  year: string,
  weeks: Week[],
  opts: { teams?: number; champion?: number | null; complete?: boolean; median?: boolean } = {},
): SeasonStandings {
  const n = opts.teams ?? 4
  const ids = Array.from({ length: n }, (_, i) => i + 1)
  const rosters = ids.map((id) => ({ roster_id: id, owner_id: `u${id}` }))
  const users = ids.map((id) => ({
    user_id: `u${id}`,
    display_name: `Owner${id}`,
    metadata: { team_name: `Team${id}` },
  }))
  const matchupsByWeek = Object.fromEntries(
    weeks.map((games, i) => [
      i + 1,
      games.flatMap(([a, pa, b, pb], m) => [
        { roster_id: a, matchup_id: m + 1, points: pa },
        { roster_id: b, matchup_id: m + 1, points: pb },
      ]),
    ]),
  )
  const { teams, weeksPlayed } = computeSeason({ rosters, users, matchupsByWeek })
  return {
    leagueId: `L${year}`,
    season: year,
    name: 'Test',
    status: 'complete',
    medianEnabled: opts.median ?? false,
    playoffWeekStart: 15,
    weeksPlayed,
    champion: opts.champion ?? null,
    placements: {},
    teams,
    complete: opts.complete ?? true,
  }
}

export function makeHistory(seasons: SeasonStandings[]): LeagueHistory {
  const newest = seasons[0]
  return {
    current: {
      league_id: newest?.leagueId ?? 'L',
      name: 'Test',
      season: newest?.season ?? '2024',
      status: 'complete',
      avatar: null,
      previous_league_id: null,
      total_rosters: newest?.teams.length ?? 0,
    },
    seasons,
  }
}

/**
 * A 4-team, 3-week season. Scores per week (roster: points):
 *   wk1: 1:100 v 2:90,  3:80 v 4:70
 *   wk2: 1:110 v 3:120, 2:60 v 4:65
 *   wk3: 1:95  v 4:99,  2:130 v 3:50
 */
export const SEASON_WEEKS: Week[] = [
  [
    [1, 100, 2, 90],
    [3, 80, 4, 70],
  ],
  [
    [1, 110, 3, 120],
    [2, 60, 4, 65],
  ],
  [
    [1, 95, 4, 99],
    [2, 130, 3, 50],
  ],
]
