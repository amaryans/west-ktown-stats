import { rivalries } from './rivalry.ts'
import { makeHistory, makeSeason, SEASON_WEEKS } from './testing.ts'

test('head-to-head ledgers across seasons', () => {
  const r = rivalries(
    makeHistory([makeSeason('2024', SEASON_WEEKS), makeSeason('2023', SEASON_WEEKS)]),
  )
  expect(r.owners.map((o) => o.ownerId)).toEqual(['u1', 'u2', 'u3', 'u4'])
  expect(r.ledger('u1', 'u4')).toMatchObject({
    record: { wins: 0, losses: 2, ties: 0 },
    games: 2,
    pointsFor: 190,
    last: { season: '2024', week: 3, points: 95, opponentPoints: 99 },
  })
  expect(r.ledger('u4', 'u1')?.record).toEqual({ wins: 2, losses: 0, ties: 0 })
  expect(r.ledger('u1', 'u1')).toBeUndefined()
})
