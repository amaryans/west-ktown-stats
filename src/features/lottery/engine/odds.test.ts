import { MAX_TEAMS, MIN_TEAMS, NBA_ODDS_BPS, oddsForLeagueSize } from './odds.ts'

describe('oddsForLeagueSize', () => {
  test('returns the NBA table verbatim for 14 teams', () => {
    expect(oddsForLeagueSize(14)).toEqual([...NBA_ODDS_BPS])
  })

  test.each(Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => MIN_TEAMS + i))(
    'produces valid odds for %i teams',
    (teamCount) => {
      // Act
      const odds = oddsForLeagueSize(teamCount)

      // Assert
      expect(odds).toHaveLength(teamCount)
      expect(odds.reduce((sum, bps) => sum + bps, 0)).toBe(10000)
      expect(odds.every((bps) => Number.isInteger(bps) && bps > 0)).toBe(true)
      for (let i = 1; i < odds.length; i++) {
        expect(odds[i]).toBeLessThanOrEqual(odds[i - 1] as number)
      }
    },
  )

  test('extends the tail for 15 and 16 team leagues', () => {
    const odds15 = oddsForLeagueSize(15)
    const odds16 = oddsForLeagueSize(16)
    // The extended tail entries stay below the NBA table's smallest entry.
    expect(odds15[14]).toBeLessThan(odds15[13] as number)
    expect(odds16[15]).toBeLessThan(odds16[14] as number)
  })

  test('throws for team counts outside the supported range', () => {
    expect(() => oddsForLeagueSize(1)).toThrow(RangeError)
    expect(() => oddsForLeagueSize(17)).toThrow(RangeError)
    expect(() => oddsForLeagueSize(10.5)).toThrow(RangeError)
  })
})
