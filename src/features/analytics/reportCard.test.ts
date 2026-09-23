import { careerCards, grade, percentiles, seasonCards } from './reportCard.ts'

test('percentiles share ties and skip unknowns', () => {
  expect(percentiles([1, 2, 3])).toEqual([0, 50, 100])
  expect(percentiles([1, 1, 3, null])).toEqual([25, 25, 100, null])
  expect(percentiles([5, null])).toEqual([50, null])
})

test('grades', () => {
  expect([95, 70, 50, 25, 5, null].map(grade)).toEqual(['A', 'B', 'C', 'D', 'F', '—'])
})

test('season cards average the skill percentiles; luck stays out', () => {
  const cards = seasonCards([
    { rosterId: 1, raw: { draft: 100, waivers: 50, trades: 0, lineups: 0.9 }, luck: -2 },
    { rosterId: 2, raw: { draft: 50, waivers: 10, trades: null, lineups: 0.8 }, luck: 3 },
  ])
  // Only roster 1 has a trade value, so it scores 50 there.
  expect(cards[0]).toMatchObject({ overall: 87.5, grade: 'A', luckScore: 0 })
  expect(cards[1]).toMatchObject({ overall: 0, grade: 'F', luckScore: 100 })
  expect(cards[1]?.scores.trades).toBeNull()
})

test('career cards average seasons', () => {
  const [a, b] = seasonCards([
    { rosterId: 1, raw: { draft: 1, waivers: 1, trades: 1, lineups: 1 }, luck: 0 },
    { rosterId: 2, raw: { draft: 0, waivers: 0, trades: 0, lineups: 0 }, luck: 0 },
  ])
  if (!a || !b) throw new Error('fixture')
  const [career] = careerCards([
    { key: 'u1', card: a },
    { key: 'u1', card: b },
  ])
  expect(career).toMatchObject({ key: 'u1', seasons: 2, overall: 50, grade: 'C' })
})
