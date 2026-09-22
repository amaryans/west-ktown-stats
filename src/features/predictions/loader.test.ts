import { describe, expect, it } from 'vitest'
import type { SleeperClient } from '../../lib/sleeper/client.ts'
import type {
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayer,
  SleeperProjection,
  SleeperRoster,
  SleeperState,
  SleeperUser,
} from '../../lib/sleeper/types.ts'
import { forecastKey, simulateSeason } from './engine/index.ts'
import {
  currentWeekFor,
  lastRegularSeasonWeek,
  loadPredictionData,
  pairingsFor,
  scoreProjections,
  simulationInput,
} from './loader.ts'

const league: SleeperLeague = {
  league_id: 'L',
  name: 'Fixture',
  season: '2026',
  status: 'in_season',
  previous_league_id: null,
  total_rosters: 4,
  settings: { playoff_week_start: 4, playoff_teams: 2, league_average_match: 0 },
  scoring_settings: { pass_td: 4, rush_yd: 0.1, rec: 0.5 },
  roster_positions: ['QB', 'RB', 'FLEX', 'BN', 'IR'],
}
const state: SleeperState = {
  season: '2026',
  league_season: '2026',
  season_type: 'regular',
  week: 2,
}
const users: SleeperUser[] = [
  { user_id: 'u1', display_name: 'Ann', metadata: { team_name: 'Anns' } },
  { user_id: 'u2', display_name: 'Ben' },
  { user_id: 'u3', display_name: 'Cy' },
  { user_id: 'u4', display_name: 'Di' },
]
const rosters: SleeperRoster[] = [
  { roster_id: 1, owner_id: 'u1', players: ['qb1', 'rb1', 'rb2', 'wr1'], reserve: ['wr1'] },
  { roster_id: 2, owner_id: 'u2', players: ['qb2', 'rb3'] },
  { roster_id: 3, owner_id: 'u3', players: ['qb3', 'rb4'] },
  { roster_id: 4, owner_id: 'u4', players: ['qb4', 'rb5'] },
]
const dump: Record<string, SleeperPlayer> = {
  qb1: { full_name: 'QB One', fantasy_positions: ['QB'], team: 'KC' },
  rb1: { full_name: 'RB One', fantasy_positions: ['RB'], team: 'KC' },
  rb2: { full_name: 'RB Two', fantasy_positions: ['RB'], team: 'DET' },
  wr1: { full_name: 'WR One', fantasy_positions: ['WR'], team: 'KC' },
  qb2: { full_name: 'QB Two', fantasy_positions: ['QB'], team: 'SF' },
  rb3: { full_name: 'RB Three', fantasy_positions: ['RB'], team: 'SF' },
  qb3: { full_name: 'QB Three', fantasy_positions: ['QB'], team: 'DET' },
  rb4: { full_name: 'RB Four', fantasy_positions: ['RB'], team: 'DET' },
  qb4: { full_name: 'QB Four', fantasy_positions: ['QB'], team: 'SF' },
  rb5: { full_name: 'RB Five', fantasy_positions: ['RB'], team: 'KC' },
}

function week(points: Record<number, number>, pairs: [number, number][]): SleeperMatchup[] {
  return pairs.flatMap(([a, b], i) => [
    { roster_id: a, matchup_id: i + 1, points: points[a] ?? 0 },
    { roster_id: b, matchup_id: i + 1, points: points[b] ?? 0 },
  ])
}
const matchups: Record<number, SleeperMatchup[]> = {
  1: week({ 1: 120, 2: 100, 3: 90, 4: 95 }, [
    [1, 2],
    [3, 4],
  ]),
  2: week({ 1: 30, 2: 0, 3: 0, 4: 0 }, [
    [1, 3],
    [2, 4],
  ]), // Thursday game in progress
  3: week({}, [
    [1, 4],
    [2, 3],
  ]),
}
// Week 3: DET is on bye (no DET player projects anything).
function proj(id: string, stats: SleeperProjection['stats']): SleeperProjection {
  return { player_id: id, stats }
}
const projections: Record<number, SleeperProjection[]> = {
  2: [
    proj('qb1', { pass_td: 2 }),
    proj('rb1', { rush_yd: 80 }),
    proj('rb2', { rush_yd: 60, rec: 2 }),
    proj('wr1', { rec: 9 }),
    proj('qb2', { pass_td: 1 }),
    proj('rb3', { rush_yd: 50 }),
    proj('qb3', { pass_td: 3 }),
    proj('rb4', { rush_yd: 40 }),
    proj('qb4', { pass_td: 1 }),
    proj('rb5', { rush_yd: 30 }),
  ],
  3: [
    proj('qb1', { pass_td: 2 }),
    proj('rb1', { rush_yd: 80 }),
    proj('wr1', { rec: 9 }),
    proj('qb2', { pass_td: 1 }),
    proj('rb3', { rush_yd: 50 }),
    proj('qb4', { pass_td: 1 }),
    proj('rb5', { rush_yd: 30 }),
  ],
  // Week 4 is the one-week playoff.
  4: [
    proj('qb1', { pass_td: 2 }),
    proj('rb1', { rush_yd: 80 }),
    proj('rb2', { rush_yd: 60 }),
    proj('qb2', { pass_td: 1 }),
    proj('rb3', { rush_yd: 50 }),
    proj('qb3', { pass_td: 3 }),
    proj('rb4', { rush_yd: 40 }),
    proj('qb4', { pass_td: 1 }),
    proj('rb5', { rush_yd: 30 }),
  ],
}

const client = {
  getState: async () => state,
  getLeague: async () => league,
  getUsers: async () => users,
  getRosters: async () => rosters,
  getMatchups: async (_id: string, w: number) => matchups[w] ?? [],
  getPlayers: async () => dump,
  getProjections: async (_season: string, w: number) => {
    const rows = projections[w]
    if (!rows) throw new Error('no projections')
    return rows
  },
} as unknown as SleeperClient

describe('helpers', () => {
  it('reads the regular-season length and the current week', () => {
    expect(lastRegularSeasonWeek(league)).toBe(3)
    expect(lastRegularSeasonWeek({ season: '2025', settings: {} })).toBe(18)
    expect(currentWeekFor(league, state, 3)).toBe(2)
    expect(currentWeekFor(league, { ...state, season_type: 'pre' }, 3)).toBe(1)
    expect(currentWeekFor(league, { ...state, season_type: 'post' }, 3)).toBe(4)
    expect(currentWeekFor(league, { ...state, season: '2027' }, 3)).toBe(4)
    expect(currentWeekFor(league, null, 3)).toBe(1)
  })

  it('pairs matchups into games', () => {
    expect(pairingsFor(3, matchups[3] ?? [])).toEqual([
      { week: 3, home: 1, away: 4 },
      { week: 3, home: 2, away: 3 },
    ])
    expect(pairingsFor(1, [{ roster_id: 1, matchup_id: null, points: 0 }])).toEqual([])
  })

  it('scores projections under the league settings', () => {
    expect(scoreProjections(projections[2] ?? [], league.scoring_settings)).toMatchObject({
      qb1: 8,
      rb2: 7,
      wr1: 4.5,
    })
  })
})

describe('loadPredictionData', () => {
  it('separates final weeks from the rest and forecasts every remaining week', async () => {
    const data = await loadPredictionData('L', () => undefined, client)
    expect(data.playedWeeks).toEqual([1])
    expect(data.remainingWeeks).toEqual([2, 3])
    expect(data.inProgressWeek).toBe(2)
    expect(data.playoffTeams).toBe(2)
    expect(data.playoffRounds).toEqual([[4]])
    expect(data.playoffWeeks).toEqual([4])
    expect(data.bracket).toBeNull()
    expect(data.reseed).toBe(false)
    expect(data.missingProjectionWeeks).toEqual([])
    // Week 4: QB 8 + RB 8 + flex rb2 6 (no receptions projected that week).
    expect(data.forecasts[forecastKey(1, 4)]?.mean).toBe(22)
    expect(data.byeTeamsByWeek[3]).toEqual(['DET'])

    const ann = data.teams.find((t) => t.rosterId === 1)
    expect(ann?.record).toEqual({ wins: 1, losses: 0, ties: 0 })
    expect(ann?.pointsFor).toBe(120)
    expect(ann?.teamName).toBe('Anns')

    // Week 2: QB 8 + best RB (rb1 8 vs rb2 7) + flex rb2 7; wr1 is on IR.
    const w2 = data.forecasts[forecastKey(1, 2)]
    expect(w2?.mean).toBe(23)
    expect(w2?.lineup.slots.some((s) => s.playerId === 'wr1')).toBe(false)
    // Week 3: rb2's team is on bye, so the flex is empty.
    const w3 = data.forecasts[forecastKey(1, 3)]
    expect(w3?.mean).toBe(16)
    expect(w3?.lineup.emptySlots).toBe(1)
    expect(w3?.lineup.byes).toEqual(['rb2'])

    expect(data.schedule).toEqual([
      { week: 2, home: 1, away: 3 },
      { week: 2, home: 2, away: 4 },
      { week: 3, home: 1, away: 4 },
      { week: 3, home: 2, away: 3 },
    ])
  })

  it('fills weeks without projections from the team average', async () => {
    const flaky = {
      ...client,
      getProjections: async (_s: string, w: number) => {
        if (w === 3) throw new Error('down')
        return projections[w] ?? []
      },
    } as unknown as SleeperClient
    const data = await loadPredictionData('L', () => undefined, flaky)
    expect(data.missingProjectionWeeks).toEqual([3])
    // Average of the weeks that do have projections (23 and 22).
    expect(data.forecasts[forecastKey(1, 3)]?.mean).toBe(22.5)
    expect(data.forecasts[forecastKey(1, 3)]?.sd).toBe(25)
  })

  it('feeds the simulation', async () => {
    const data = await loadPredictionData('L', () => undefined, client)
    const result = simulateSeason(simulationInput(data, 500, 1))
    expect(result.teams).toHaveLength(4)
    const ann = result.teams.find((t) => t.rosterId === 1)
    expect(ann?.playoff).toBeGreaterThan(0.5)
    expect(result.rounds).toBe(1)
    expect(result.teams.reduce((sum, t) => sum + t.champion, 0)).toBeCloseTo(1)
    expect(ann?.final).toBe(ann?.playoff)
  })

  it('replays the live bracket once the playoffs have started', async () => {
    const inPlayoffs = {
      ...client,
      getState: async () => ({ ...state, week: 4 }),
      getMatchups: async (_id: string, w: number) =>
        w === 3
          ? week({ 1: 110, 2: 100, 3: 105, 4: 90 }, [
              [1, 4],
              [2, 3],
            ])
          : (matchups[w] ?? []),
      getWinnersBracket: async () => [
        { r: 1, m: 1, t1: 1, t2: 2, w: null, l: null, p: 1 },
        { r: 1, m: 2, t1: 3, t2: 4, w: 3, l: 4, p: 3 },
      ],
    } as unknown as SleeperClient
    const data = await loadPredictionData('L', () => undefined, inPlayoffs)
    expect(data.playedWeeks).toEqual([1, 2, 3])
    expect(data.remainingWeeks).toEqual([])
    expect(data.bracket).toHaveLength(2)
    const result = simulateSeason(simulationInput(data, 200, 1))
    const byId = new Map(result.teams.map((t) => [t.rosterId, t]))
    expect((byId.get(1)?.champion ?? 0) + (byId.get(2)?.champion ?? 0)).toBeCloseTo(1)
    expect(byId.get(3)?.champion).toBe(0)
    expect(byId.get(1)?.final).toBe(1)
  })
})
