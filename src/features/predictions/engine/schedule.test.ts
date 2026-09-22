import { describe, expect, it } from 'vitest'
import { forecastKey } from './forecast.ts'
import { remainingStrength } from './schedule.ts'

describe('remainingStrength', () => {
  it('averages the projected scores of remaining opponents and ranks hardest first', () => {
    const forecasts = {
      [forecastKey(1, 5)]: { mean: 130 },
      [forecastKey(2, 5)]: { mean: 100 },
      [forecastKey(3, 5)]: { mean: 90 },
      [forecastKey(1, 6)]: { mean: 120 },
      [forecastKey(3, 6)]: { mean: 110 },
    }
    const rows = remainingStrength(
      [1, 2, 3, 4],
      [
        { week: 5, home: 1, away: 2 },
        { week: 5, home: 3, away: 4 },
        { week: 6, home: 1, away: 3 },
      ],
      forecasts,
    )
    expect(rows.find((r) => r.rosterId === 1)).toEqual({
      rosterId: 1,
      games: 2,
      opponentAverage: 105,
      rank: 3,
    })
    expect(rows.find((r) => r.rosterId === 3)).toEqual({
      rosterId: 3,
      games: 1,
      opponentAverage: 120,
      rank: 2,
    })
    expect(rows.find((r) => r.rosterId === 2)?.opponentAverage).toBe(130)
    expect(rows.find((r) => r.rosterId === 2)?.rank).toBe(1)
    expect(rows.find((r) => r.rosterId === 4)).toEqual({
      rosterId: 4,
      games: 1,
      opponentAverage: 90,
      rank: 4,
    })
    // Team 3's week 5 opponent (4) has no forecast, so only its week 6 game counts above.
    expect(remainingStrength([9], [], forecasts)[0]?.opponentAverage).toBeNull()
  })
})
