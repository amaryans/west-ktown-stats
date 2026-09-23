import { careerLuck, seasonLuck } from './allplay.ts'
import { makeHistory, makeSeason, SEASON_WEEKS } from './testing.ts'

const season = makeSeason('2024', SEASON_WEEKS)
const byId = (id: number) => seasonLuck(season).find((r) => r.rosterId === id)

test('all-play record compares every score with every other score each week', () => {
  expect(byId(1)?.allPlay).toEqual({ wins: 6, losses: 3, ties: 0 })
  expect(byId(4)?.allPlay).toEqual({ wins: 3, losses: 6, ties: 0 })
  expect(byId(1)?.allPlayPct).toBeCloseTo(2 / 3)
})

test('expected wins sum to the games played and luck is actual minus expected', () => {
  const rows = seasonLuck(season)
  expect(rows.reduce((s, r) => s + r.expectedWins, 0)).toBeCloseTo(6, 1)
  expect(byId(1)).toMatchObject({ expectedWins: 2, actualWins: 1, luck: -1 })
  expect(byId(4)).toMatchObject({ expectedWins: 1, actualWins: 2, luck: 1 })
  expect(byId(3)?.luck).toBeCloseTo(0.67, 2)
})

test('lucky wins come below the weekly median, unlucky losses above it', () => {
  expect(byId(3)).toMatchObject({ luckyWins: 1, unluckyLosses: 0 })
  expect(byId(4)).toMatchObject({ luckyWins: 1, unluckyLosses: 0 })
  expect(byId(1)).toMatchObject({ luckyWins: 0, unluckyLosses: 1 })
  expect(byId(2)).toMatchObject({ luckyWins: 0, unluckyLosses: 1 })
})

test('throughWeek limits the weeks counted', () => {
  const wk1 = seasonLuck(season, 1).find((r) => r.rosterId === 3)
  expect(wk1).toMatchObject({ weeks: 1, allPlay: { wins: 1, losses: 2, ties: 0 } })
})

test('career luck adds up seasons per owner', () => {
  const history = makeHistory([makeSeason('2024', SEASON_WEEKS), makeSeason('2023', SEASON_WEEKS)])
  const owner1 = careerLuck(history).find((r) => r.ownerId === 'u1')
  expect(owner1).toMatchObject({ seasons: 2, expectedWins: 4, actualWins: 2, luck: -2 })
  expect(owner1?.allPlay).toEqual({ wins: 12, losses: 6, ties: 0 })
})
