import { computeLotterySeeds, hasPlayoffResults, isPreseason } from './ordering.ts'
import type { Team } from './types.ts'

function makeTeam(overrides: Partial<Team> & { id: string }): Team {
  return {
    ownerName: `owner-${overrides.id}`,
    teamName: `team-${overrides.id}`,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    avatarUrl: null,
    playoffFinish: null,
    ...overrides,
  }
}

describe('computeLotterySeeds (regular season)', () => {
  test('orders worst record first', () => {
    const teams = [
      makeTeam({ id: 'a', wins: 10, losses: 4, pointsFor: 1500 }),
      makeTeam({ id: 'b', wins: 2, losses: 12, pointsFor: 1100 }),
      makeTeam({ id: 'c', wins: 7, losses: 7, pointsFor: 1300 }),
    ]
    const seeded = computeLotterySeeds(teams, 'regularSeason')
    expect(seeded.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  test('breaks record ties by fewer points-for', () => {
    const teams = [
      makeTeam({ id: 'high', wins: 5, losses: 9, pointsFor: 1400 }),
      makeTeam({ id: 'low', wins: 5, losses: 9, pointsFor: 1200 }),
    ]
    const seeded = computeLotterySeeds(teams, 'regularSeason')
    expect(seeded.map((t) => t.id)).toEqual(['low', 'high'])
  })

  test('does not mutate the input array', () => {
    const teams = [
      makeTeam({ id: 'a', wins: 9, losses: 5 }),
      makeTeam({ id: 'b', wins: 1, losses: 13 }),
    ]
    const original = [...teams]
    computeLotterySeeds(teams, 'regularSeason')
    expect(teams).toEqual(original)
  })

  test('counts ties as half a win', () => {
    const teams = [
      makeTeam({ id: 'tied', wins: 6, losses: 6, ties: 2, pointsFor: 1000 }), // .500
      makeTeam({ id: 'under', wins: 6, losses: 8, ties: 0, pointsFor: 1000 }), // .429
    ]
    const seeded = computeLotterySeeds(teams, 'regularSeason')
    expect(seeded.map((t) => t.id)).toEqual(['under', 'tied'])
  })
})

describe('computeLotterySeeds (playoffs)', () => {
  test('champion gets the final seed; non-playoff teams seed first by record', () => {
    const teams = [
      makeTeam({ id: 'champ', wins: 11, losses: 3, playoffFinish: 1 }),
      makeTeam({ id: 'runnerUp', wins: 12, losses: 2, playoffFinish: 2 }),
      makeTeam({ id: 'third', wins: 9, losses: 5, playoffFinish: 3 }),
      makeTeam({ id: 'missedBad', wins: 2, losses: 12 }),
      makeTeam({ id: 'missedOk', wins: 7, losses: 7 }),
    ]
    const seeded = computeLotterySeeds(teams, 'playoffs')
    expect(seeded.map((t) => t.id)).toEqual(['missedBad', 'missedOk', 'third', 'runnerUp', 'champ'])
  })

  test('throws when no playoff results exist', () => {
    const teams = [makeTeam({ id: 'a' }), makeTeam({ id: 'b' })]
    expect(() => computeLotterySeeds(teams, 'playoffs')).toThrow(/playoff/i)
  })
})

describe('helpers', () => {
  test('hasPlayoffResults detects placements', () => {
    expect(hasPlayoffResults([makeTeam({ id: 'a', playoffFinish: 1 })])).toBe(true)
    expect(hasPlayoffResults([makeTeam({ id: 'a' })])).toBe(false)
  })

  test('isPreseason is true only when no games have been played', () => {
    expect(isPreseason([makeTeam({ id: 'a' }), makeTeam({ id: 'b' })])).toBe(true)
    expect(isPreseason([makeTeam({ id: 'a', wins: 1 })])).toBe(false)
  })
})
