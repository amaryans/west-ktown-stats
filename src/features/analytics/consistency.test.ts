import { careerConsistency, seasonConsistency } from './consistency.ts'
import { makeHistory, makeSeason, SEASON_WEEKS } from './testing.ts'

const season = makeSeason('2024', SEASON_WEEKS)
const t = (id: number) => seasonConsistency(season).find((r) => r.rosterId === id)

test('scoring spread, floor and ceiling', () => {
  expect(t(1)).toMatchObject({ games: 3, avg: 101.67, floor: 95, ceiling: 110 })
  expect(t(1)?.sd).toBeCloseTo(6.24, 2)
})

test('close games are decided by under ten points', () => {
  expect(t(1)?.close).toEqual({ wins: 0, losses: 1, ties: 0 })
  expect(t(4)?.close).toEqual({ wins: 2, losses: 0, ties: 0 })
})

test('best loss and worst win', () => {
  expect(t(1)).toMatchObject({ bestLoss: 110, worstWin: 100 })
  expect(t(2)).toMatchObject({ bestLoss: 90, worstWin: 130 })
})

test('booms and busts are measured against the whole league', () => {
  expect(t(2)?.booms).toBe(1) // 130
  expect(t(3)?.busts).toBe(1) // 50
})

test('career consistency pools every season', () => {
  const rows = careerConsistency(makeHistory([season, makeSeason('2023', SEASON_WEEKS)]))
  expect(rows.find((r) => r.ownerId === 'u1')?.games).toBe(6)
})
