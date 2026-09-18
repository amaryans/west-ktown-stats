import type { SleeperLeagueBundle } from './client.ts'
import { mapSleeperLeague, parsePlacements } from './mapping.ts'
import leagueFixture from './__fixtures__/league.json'
import rostersFixture from './__fixtures__/rosters.json'
import usersFixture from './__fixtures__/users.json'
import winnersBracketFixture from './__fixtures__/winners_bracket.json'

function makeBundle(overrides: Partial<SleeperLeagueBundle> = {}): SleeperLeagueBundle {
  return {
    league: leagueFixture,
    rosters: rostersFixture,
    users: usersFixture,
    winnersBracket: winnersBracketFixture,
    ...overrides,
  }
}

describe('mapSleeperLeague', () => {
  test('maps league metadata and all rosters', () => {
    const league = mapSleeperLeague(makeBundle())
    expect(league.source).toBe('sleeper')
    expect(league.name).toBe('Sleeper Friends League')
    expect(league.season).toBe('2018')
    expect(league.sleeperLeagueId).toBe('289646328504385536')
    expect(league.previousLeagueId).toBe('198946952535085056')
    expect(league.teams).toHaveLength(12)
  })

  test('joins rosters to users for names and records', () => {
    const league = mapSleeperLeague(makeBundle())
    const teamOne = league.teams.find((t) => t.id === '1')
    expect(teamOne).toBeDefined()
    expect(teamOne?.wins).toBe(7)
    expect(teamOne?.losses).toBe(6)
    expect(teamOne?.pointsFor).toBeCloseTo(1776.06, 2)
    expect(teamOne?.ownerName).not.toMatch(/^Team \d+$/)
  })

  test('builds sleepercdn avatar URLs from avatar ids', () => {
    const league = mapSleeperLeague(makeBundle())
    const withAvatar = league.teams.filter((t) => t.avatarUrl !== null)
    expect(withAvatar.length).toBeGreaterThan(0)
    for (const team of withAvatar) {
      expect(team.avatarUrl).toMatch(/^https?:\/\//)
    }
  })

  test('assigns playoff placements from the winners bracket', () => {
    const league = mapSleeperLeague(makeBundle())
    // Fixture bracket: p=1 game w=6 l=3, p=3 game w=1 l=2, p=5 game w=10 l=5
    expect(league.teams.find((t) => t.id === '6')?.playoffFinish).toBe(1)
    expect(league.teams.find((t) => t.id === '3')?.playoffFinish).toBe(2)
    expect(league.teams.find((t) => t.id === '1')?.playoffFinish).toBe(3)
    expect(league.teams.find((t) => t.id === '2')?.playoffFinish).toBe(4)
    expect(league.teams.find((t) => t.id === '10')?.playoffFinish).toBe(5)
    expect(league.teams.find((t) => t.id === '5')?.playoffFinish).toBe(6)
    // Teams outside placement games have no finish
    expect(league.teams.find((t) => t.id === '4')?.playoffFinish).toBeNull()
  })

  test('handles a missing bracket without failing', () => {
    const league = mapSleeperLeague(makeBundle({ winnersBracket: null }))
    expect(league.teams.every((t) => t.playoffFinish === null)).toBe(true)
  })

  test('gives orphan rosters a fallback team name', () => {
    const rosters = rostersFixture.map((r, i) => (i === 0 ? { ...r, owner_id: null } : r))
    const league = mapSleeperLeague(makeBundle({ rosters }))
    const orphan = league.teams.find((t) => t.id === String(rostersFixture[0]?.roster_id))
    expect(orphan?.teamName).toMatch(/^Team \d+$/)
    expect(orphan?.avatarUrl).toBeNull()
  })

  test('throws for a league with no rosters', () => {
    expect(() => mapSleeperLeague(makeBundle({ rosters: [] }))).toThrow(/no rosters/)
  })
})

describe('parsePlacements', () => {
  test('winner takes place p, loser takes p+1', () => {
    const placements = parsePlacements([
      { r: 3, m: 6, t1: 6, t2: 3, w: 6, l: 3, p: 1 },
      { r: 3, m: 7, t1: 1, t2: 2, w: 1, l: 2, p: 3 },
    ])
    expect(placements.get(6)).toBe(1)
    expect(placements.get(3)).toBe(2)
    expect(placements.get(1)).toBe(3)
    expect(placements.get(2)).toBe(4)
  })

  test('ignores non-placement matchups', () => {
    const placements = parsePlacements([{ r: 1, m: 1, t1: 5, t2: 1, w: 1, l: 5 }])
    expect(placements.size).toBe(0)
  })
})
