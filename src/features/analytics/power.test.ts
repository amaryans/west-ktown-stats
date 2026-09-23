import { powerRankings } from './power.ts'
import { makeSeason, SEASON_WEEKS } from './testing.ts'

const season = makeSeason('2024', SEASON_WEEKS)

test('balanced formula blends all-play, win % and recent form', () => {
  const { rows, weeks } = powerRankings(season)
  expect(weeks).toEqual([1, 2, 3])
  expect(rows.map((r) => r.rosterId)).toEqual([1, 3, 2, 4])
  expect(rows[0]).toMatchObject({ score: 56.7, rank: 1, prevRank: 2, trend: [1, 2, 1] })
  expect(rows.find((r) => r.rosterId === 4)?.score).toBe(43.3)
})

test('classic formula is the Oberon rating', () => {
  const t1 = powerRankings(season, 'classic').rows.find((r) => r.rosterId === 1)
  expect(t1).toMatchObject({ high: 110, low: 95, score: 115.3 })
})

test('asOfWeek rewinds the rankings', () => {
  const { rows } = powerRankings(season, 'balanced', 2)
  expect(rows.map((r) => r.rosterId)).toEqual([3, 1, 4, 2])
  expect(rows[0]?.prevRank).toBe(2)
})

test('median games count toward win % when the league plays them', () => {
  const withMedian = makeSeason('2024', SEASON_WEEKS, { median: true })
  const t3 = powerRankings(withMedian).rows.find((r) => r.rosterId === 3)
  // h2h 2-1 plus median games: above wk2 only -> 3-3
  expect(t3?.record).toEqual({ wins: 3, losses: 3, ties: 0 })
})
