import { buildLotteryConfig, effectiveFloors, effectiveOddsBps } from './lotteryConfig.ts'
import { oddsForLeagueSize } from '../engine/odds.ts'
import type { AppSettings, League, Team } from './types.ts'

function makeTeam(id: string, wins: number): Team {
  return {
    id,
    ownerName: `owner-${id}`,
    teamName: `team-${id}`,
    wins,
    losses: 14 - wins,
    ties: 0,
    pointsFor: 1000 + wins,
    avatarUrl: null,
    playoffFinish: null,
  }
}

function makeLeague(teamCount = 4): League {
  return {
    source: 'manual',
    name: 'Builder Test',
    teams: Array.from({ length: teamCount }, (_, i) => makeTeam(`t${i + 1}`, i)),
  }
}

function makeSettings(patch: Partial<AppSettings> = {}): AppSettings {
  return {
    orderingSource: 'regularSeason',
    slotMode: 'winnerChoosesSlot',
    customOddsBps: null,
    pickFloors: null,
    ...patch,
  }
}

describe('effectiveOddsBps', () => {
  test('falls back to the NBA table without valid overrides', () => {
    expect(effectiveOddsBps(4, makeSettings())).toEqual(oddsForLeagueSize(4))
    expect(effectiveOddsBps(4, makeSettings({ customOddsBps: [5000, 5000] }))).toEqual(
      oddsForLeagueSize(4),
    ) // wrong length
    expect(effectiveOddsBps(4, makeSettings({ customOddsBps: [4000, 3000, 2000, 999] }))).toEqual(
      oddsForLeagueSize(4),
    ) // wrong sum
  })

  test('uses valid custom overrides', () => {
    const custom = [4000, 3000, 2000, 1000]
    expect(effectiveOddsBps(4, makeSettings({ customOddsBps: custom }))).toEqual(custom)
  })
})

describe('effectiveFloors', () => {
  test('drops absent, invalid, or all-null floors', () => {
    expect(effectiveFloors(4, makeSettings())).toBeUndefined()
    expect(
      effectiveFloors(4, makeSettings({ pickFloors: [null, null, null, null] })),
    ).toBeUndefined()
    expect(effectiveFloors(4, makeSettings({ pickFloors: [1, 1, null, null] }))).toBeUndefined()
    expect(effectiveFloors(4, makeSettings({ pickFloors: [2, null] }))).toBeUndefined()
  })

  test('passes satisfiable floors through', () => {
    expect(effectiveFloors(4, makeSettings({ pickFloors: [3, null, null, null] }))).toEqual([
      3,
      null,
      null,
      null,
    ])
  })
})

describe('buildLotteryConfig', () => {
  test('seeds worst team first and wires odds + floors', () => {
    const config = buildLotteryConfig(
      makeLeague(),
      makeSettings({ pickFloors: [2, null, null, null] }),
    )
    expect(config.teams.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']) // t1 has fewest wins
    expect(config.teams.map((t) => t.seed)).toEqual([1, 2, 3, 4])
    expect(config.oddsBps).toEqual(oddsForLeagueSize(4))
    expect(config.floors).toEqual([2, null, null, null])
  })

  test('playoff ordering falls back to regular season without bracket data', () => {
    const config = buildLotteryConfig(makeLeague(), makeSettings({ orderingSource: 'playoffs' }))
    expect(config.teams.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4'])
  })
})
