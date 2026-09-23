import type { SleeperMatchup } from '../../lib/sleeper/types.ts'
import { draftGrades, gradePicks, stealsAndBusts, summariseDrafts } from './draft.ts'

const pick = (
  playerId: string,
  pickNo: number,
  rosterId: number,
  position: string,
  isKeeper = false,
) => ({
  playerId,
  pickNo,
  rosterId,
  position,
  isKeeper,
  round: Math.ceil(pickNo / 2),
  name: playerId,
})

const picks = [
  pick('A', 1, 1, 'RB'),
  pick('B', 2, 2, 'RB'),
  pick('C', 3, 2, 'WR'),
  pick('D', 4, 1, 'WR'),
  pick('K', 5, 1, 'WR', true),
]
const matchups: Record<number, SleeperMatchup[]> = {
  1: [
    {
      roster_id: 1,
      matchup_id: 1,
      points: 50,
      starters: ['A', 'D'],
      players_points: { A: 10, D: 40, K: 5 },
    },
    { roster_id: 2, matchup_id: 1, points: 30, starters: ['B'], players_points: { B: 30, C: 20 } },
  ],
}
const graded = gradePicks(picks, matchups)
const by = (id: string) => graded.find((p) => p.playerId === id)

test('picks are valued within position, keepers left out', () => {
  expect(graded.map((p) => p.playerId)).toEqual(['A', 'B', 'C', 'D'])
  // RBs: A taken RB1 finished RB2; B taken RB2 finished RB1.
  expect(by('A')).toMatchObject({
    finishRank: 4,
    positionPick: 1,
    positionRank: 2,
    value: -1,
    starterPoints: 10,
  })
  expect(by('B')).toMatchObject({ positionPick: 2, positionRank: 1, value: 1 })
  expect(by('D')).toMatchObject({ finishRank: 1, positionRank: 1, value: 1 })
  expect(by('C')).toMatchObject({ points: 20, starterPoints: 0, starts: 0, value: -1 })
})

test('without a position, value falls back to overall pick minus overall finish', () => {
  const [p] = gradePicks(
    [{ ...pick('A', 1, 1, 'RB'), position: null }, pick('D', 4, 1, 'WR')],
    matchups,
  )
  expect(p).toMatchObject({ positionRank: null, finishRank: 2, value: -1 })
})

test('drafts are ranked on starter points from the class', () => {
  const rows = summariseDrafts(graded)
  expect(rows.find((r) => r.rosterId === 1)).toMatchObject({
    starterPoints: 50,
    vsAverage: 10,
    rank: 1,
    avgValue: 0,
  })
  expect(rows.find((r) => r.rosterId === 1)?.best?.playerId).toBe('D')
  expect(rows.find((r) => r.rosterId === 2)).toMatchObject({ vsAverage: -10, rank: 2 })
})

test('steals and early-round busts', () => {
  const { steals, busts } = stealsAndBusts(graded, 1, 1)
  expect(steals[0]?.playerId).toBe('D')
  expect(busts[0]?.playerId).toBe('A')
})

const ADP: Record<string, number> = { A: 3, B: 1, C: 10, D: 2, K: 20 }
const adpOf = (p: { playerId: string }) => ADP[p.playerId] ?? null

test('draft-day value is ADP minus pick', () => {
  const g = gradePicks(picks, matchups, { adpOf })
  expect(g.find((p) => p.playerId === 'A')).toMatchObject({ adp: 3, adpValue: 2 })
  expect(g.find((p) => p.playerId === 'D')).toMatchObject({ adp: 2, adpValue: -2 })
})

test('keepers can be included at the pick they cost', () => {
  const g = gradePicks(picks, matchups, { includeKeepers: true, adpOf })
  expect(g.map((p) => p.playerId)).toEqual(['A', 'B', 'C', 'D', 'K'])
  expect(g.find((p) => p.playerId === 'K')).toMatchObject({ isKeeper: true, adpValue: 15 })
  expect(summariseDrafts(g).find((r) => r.rosterId === 1)).toMatchObject({ picks: 3, keepers: 1 })
})

test('draft-day and post-season grades can disagree', () => {
  const grades = draftGrades(summariseDrafts(gradePicks(picks, matchups, { adpOf })))
  // Roster 2 got value on draft day (B -1, C +7) but its class scored less.
  expect(grades.find((g) => g.rosterId === 2)).toMatchObject({
    preScore: 100,
    preGrade: 'A',
    postScore: 0,
    postGrade: 'F',
    change: -100,
  })
  expect(grades.find((g) => g.rosterId === 1)).toMatchObject({ preGrade: 'F', postGrade: 'A' })
})

test('no draft-day grade without ADP for most picks', () => {
  const [g] = draftGrades(summariseDrafts(gradePicks(picks, matchups)))
  expect(g).toMatchObject({ preScore: null, preGrade: '—', change: null })
})
