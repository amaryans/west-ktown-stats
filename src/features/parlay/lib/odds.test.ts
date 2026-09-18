import {
  deriveParlayResult,
  formatAmerican,
  parlayOdds,
  parseAmerican,
  potentialPayout,
} from './odds.ts'
import { bestLine, legFromLine, summariseBoard } from './board.ts'
import { nflWeekFor, weekLabel } from './week.ts'
import type { Game, GameOdds } from '../../../lib/db.ts'

test('parseAmerican accepts +150, -110, EVEN and rejects nonsense', () => {
  expect(parseAmerican('+150')).toBe(150)
  expect(parseAmerican('-110')).toBe(-110)
  expect(parseAmerican('even')).toBe(100)
  expect(parseAmerican('')).toBeNull()
  expect(parseAmerican('50')).toBeNaN()
  expect(parseAmerican('abc')).toBeNaN()
  expect(formatAmerican(150)).toBe('+150')
  expect(formatAmerican(null)).toBe('—')
})

test('parlay odds multiply decimals and drop pushes', () => {
  const legs = [
    { odds: -110, result: 'pending' as const },
    { odds: 150, result: 'pending' as const },
    { odds: -200, result: 'push' as const },
    { odds: null, result: 'pending' as const },
  ]
  const o = parlayOdds(legs)
  expect(o.decimal).toBeCloseTo((1 + 100 / 110) * 2.5, 5)
  expect(o.american).toBe(377)
  expect(o.legCount).toBe(3)
  expect(o.missingOdds).toBe(1)
  expect(potentialPayout(10, legs)).toBeCloseTo(47.73, 2)
})

test('deriveParlayResult', () => {
  expect(deriveParlayResult([])).toBe('pending')
  expect(deriveParlayResult([{ result: 'won' }, { result: 'lost' }])).toBe('lost')
  expect(deriveParlayResult([{ result: 'won' }, { result: 'pending' }])).toBe('pending')
  expect(deriveParlayResult([{ result: 'won' }, { result: 'push' }])).toBe('won')
  expect(deriveParlayResult([{ result: 'push' }])).toBe('push')
})

test('week helpers', () => {
  expect(nflWeekFor(new Date(2025, 8, 4), '2025-09-04')).toBe(1)
  expect(nflWeekFor(new Date(2025, 8, 9), '2025-09-04')).toBe(2)
  expect(weekLabel(19)).toBe('Wild Card')
})

const game: Game = {
  id: 'g1',
  event_id: 'e1',
  season: 2025,
  week: 3,
  commence_time: '2025-09-21T17:00:00Z',
  home_team: 'Ravens',
  away_team: 'Chiefs',
  updated_at: '',
}
const row = (
  bookmaker: string,
  market: GameOdds['market'],
  outcome: string,
  point: number | null,
  price: number,
): GameOdds => ({
  id: `${bookmaker}-${market}-${outcome}`,
  game_id: 'g1',
  bookmaker,
  market,
  outcome,
  point,
  price,
  fetched_at: '2025-09-20T00:00:00Z',
})

test('bestLine uses the consensus point and the best price at it', () => {
  const rows = [
    row('dk', 'spreads', 'Ravens', -3.5, -110),
    row('fd', 'spreads', 'Ravens', -3.5, -105),
    row('mgm', 'spreads', 'Ravens', -3, -120),
  ]
  const line = bestLine(rows, 'spreads', 'Ravens')
  expect(line).toMatchObject({ point: -3.5, price: -105, bookmaker: 'fd', books: 2 })
  expect(bestLine(rows, 'spreads', 'Ravens', -3).price).toBe(-120)
  const [board] = summariseBoard([game], [...rows, row('dk', 'h2h', 'Chiefs', null, 120)])
  expect(board?.markets.h2h[0]?.outcome).toBe('Chiefs')
  expect(legFromLine(game, 'spreads', line)).toMatchObject({
    pick: 'Ravens -3.5',
    market: 'spread',
    odds: -105,
  })
})
