import { scheduleSwap } from './schedule.ts'
import { makeSeason, SEASON_WEEKS } from './testing.ts'

const swap = scheduleSwap(makeSeason('2024', SEASON_WEEKS))
const cell = (a: number, b: number) =>
  swap.cells[swap.rosterIds.indexOf(a)]?.[swap.rosterIds.indexOf(b)]

test('the diagonal is the real record', () => {
  expect(cell(1, 1)).toEqual({ wins: 1, losses: 2, ties: 0 })
  expect(cell(4, 4)).toEqual({ wins: 2, losses: 1, ties: 0 })
})

test('playing yourself on a borrowed schedule means playing its owner instead', () => {
  // Team 4 faced 3 (80), 2 (60), then team 1 itself, so team 1 plays team 4 (99) that week.
  expect(cell(1, 4)).toEqual({ wins: 2, losses: 1, ties: 0 })
})

test('summary counts better and worse schedules', () => {
  const t1 = swap.summary.find((s) => s.rosterId === 1)
  expect(t1?.actual).toEqual({ wins: 1, losses: 2, ties: 0 })
  expect(t1?.betterWith).toBeGreaterThan(0)
  expect(t1?.bestSchedule?.record.wins).toBeGreaterThanOrEqual(2)
})
