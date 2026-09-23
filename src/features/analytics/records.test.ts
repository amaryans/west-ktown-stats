import { droughts, recordBook, streaks, tallyAwards, weeklyAwards } from './records.ts'
import { makeHistory, makeSeason, SEASON_WEEKS } from './testing.ts'

const season = makeSeason('2024', SEASON_WEEKS)

test('weekly awards', () => {
  const awards = weeklyAwards(season)
  expect(awards).toHaveLength(3)
  const wk3 = awards[2]
  expect(wk3?.high.team.rosterId).toBe(2)
  expect(wk3?.low.team.rosterId).toBe(3)
  expect(wk3?.blowout.margin).toBe(80)
  expect(wk3?.closest).toMatchObject({ margin: 4, team: { rosterId: 4 } })
  expect(wk3?.heartbreak?.team.rosterId).toBe(1)
  expect(wk3?.lucky?.team.rosterId).toBe(4)
})

test('award tallies count per manager', () => {
  const tally = tallyAwards(weeklyAwards(season))
  expect(tally.find((r) => r.key === 'u1')?.counts.high).toBe(1)
  expect(tally.find((r) => r.key === 'u2')?.counts.high).toBe(1)
})

test('record book', () => {
  const book = recordBook([season], 3)
  expect(book.highestScores[0]?.points).toBe(130)
  expect(book.lowestScores[0]?.points).toBe(50)
  expect(book.biggestBlowouts[0]?.margin).toBe(80)
  expect(book.closestGames[0]?.margin).toBe(4)
  expect(book.highestInLoss[0]?.points).toBe(110)
  expect(book.lowestInWin[0]?.points).toBe(65)
  expect(book.highestCombined[0]?.points).toBe(230)
  // Each game appears once in game lists.
  expect(recordBook([season], 99).biggestBlowouts).toHaveLength(6)
})

test('season marks skip seasons still in progress', () => {
  const live = makeSeason('2025', SEASON_WEEKS, { complete: false })
  expect(recordBook([live]).mostPointsSeason).toHaveLength(0)
})

test('streaks carry across seasons and flag active runs', () => {
  const history = makeHistory([season, makeSeason('2023', SEASON_WEEKS)])
  const all = streaks(history)
  // Owner 3: W W L, then W W L -> longest win streak 2, not active.
  expect(all.find((s) => s.ownerId === 'u3' && s.kind === 'win')).toMatchObject({
    length: 2,
    active: false,
  })
  // Owner 1: W L L, W L L -> loss streak of 2, active.
  expect(all.find((s) => s.ownerId === 'u1' && s.kind === 'loss')).toMatchObject({
    length: 2,
    active: true,
    to: { season: '2024', week: 3 },
  })
  // Owner 4: L W W, L W W -> win streak 2, active.
  expect(all.find((s) => s.ownerId === 'u4' && s.kind === 'win')?.active).toBe(true)
})

test('droughts count completed seasons since the last title', () => {
  const history = makeHistory([
    makeSeason('2025', SEASON_WEEKS, { complete: false }),
    makeSeason('2024', SEASON_WEEKS, { champion: 3 }),
    makeSeason('2023', SEASON_WEEKS, { champion: 2 }),
  ])
  const rows = droughts(history)
  expect(rows.find((r) => r.ownerId === 'u2')).toMatchObject({
    titles: 1,
    lastTitle: '2023',
    seasonsSince: 1,
  })
  expect(rows.find((r) => r.ownerId === 'u1')).toMatchObject({ titles: 0, seasonsSince: 2 })
})
