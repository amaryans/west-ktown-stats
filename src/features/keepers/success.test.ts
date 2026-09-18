import {
  managerRecords,
  scoreKeepers,
  seasonOutcomes,
  type SeasonSuccessInput,
  type SuccessPick,
  type SuccessTeam,
} from './success.ts'

const teams: SuccessTeam[] = [
  {
    rosterId: 1,
    ownerId: 'u1',
    ownerName: 'Ann',
    teamName: 'Ann FC',
    avatarSrc: null,
    rank: 1,
    placement: 1,
    wins: 3,
    losses: 0,
    ties: 0,
  },
  {
    rosterId: 2,
    ownerId: 'u2',
    ownerName: 'Bob',
    teamName: 'Bob FC',
    avatarSrc: null,
    rank: 2,
    placement: null,
    wins: 0,
    losses: 3,
    ties: 0,
  },
]

const pick = (
  playerId: string,
  rosterId: number,
  pickNo: number,
  extra: Partial<SuccessPick> = {},
): SuccessPick => ({
  playerId,
  rosterId,
  round: Math.ceil(pickNo / 2),
  pickNo,
  isKeeper: false,
  name: `Player ${playerId}`,
  position: 'RB',
  ...extra,
})

// Two teams, three weeks. Player A (kept by Ann at pick 4) is the top scorer;
// player D (kept by Bob at pick 2) barely scores and rides the bench once.
const picks: SuccessPick[] = [
  pick('B', 1, 1),
  pick('D', 2, 2, { isKeeper: true, position: 'WR' }),
  pick('C', 2, 3),
  pick('A', 1, 4, { isKeeper: true }),
]
const week = (
  r1: Record<string, number>,
  r2: Record<string, number>,
  starters2: string[] = ['D', 'C'],
) => [
  {
    roster_id: 1,
    matchup_id: 1,
    points: Object.values(r1).reduce((a, b) => a + b, 0),
    starters: ['A', 'B'],
    players_points: r1,
  },
  {
    roster_id: 2,
    matchup_id: 1,
    points: starters2.reduce((sum, id) => sum + (r2[id] ?? 0), 0),
    starters: starters2,
    players_points: r2,
  },
]
const input: SeasonSuccessInput = {
  season: 2025,
  leagueId: 'L',
  complete: true,
  picks,
  savedKeeperIds: [],
  matchupsByWeek: {
    1: week({ A: 20, B: 10 }, { D: 5, C: 8 }),
    2: week({ A: 25, B: 12 }, { D: 2, C: 9 }, ['C']),
    3: week({ A: 15, B: 11 }, { D: 6, C: 7 }),
  },
  teams,
  adpByName: new Map([
    ['player a', 1.5],
    ['player d', 12],
  ]),
}

test('seasonOutcomes prices, ranks and measures each keeper', () => {
  const rows = seasonOutcomes(input)
  expect(rows.map((r) => r.playerId)).toEqual(['D', 'A'])
  const a = rows.find((r) => r.playerId === 'A')!
  expect(a).toMatchObject({
    ownerName: 'Ann',
    keepRound: 2,
    keepPick: 4,
    adp: 1.5,
    draftValue: 2.5,
    points: 60,
    weeksRostered: 3,
    weeksStarted: 3,
    starterPoints: 60,
    teamPoints: 93,
    finishRank: 1,
    positionFinish: 1,
    draftedCount: 4,
    performance: 3,
    teamRank: 1,
    teamPlacement: 1,
    teamRecord: '3-0',
    score: null,
  })
  expect(a.impactShare).toBeCloseTo(60 / 93)

  const d = rows.find((r) => r.playerId === 'D')!
  expect(d).toMatchObject({
    ownerName: 'Bob',
    keepPick: 2,
    draftValue: -10,
    points: 13,
    weeksStarted: 2,
    starterPoints: 11,
    finishRank: 4,
    performance: -2,
    positionFinish: 1, // the only WR drafted
  })
  expect(d.impactShare).toBeCloseTo(11 / (13 + 9 + 13))
})

test('saved keeper lists add to the draft flags, and keepers outside the draft are skipped', () => {
  const rows = seasonOutcomes({ ...input, savedKeeperIds: ['C', 'ZZ'] })
  expect(rows.map((r) => r.playerId).sort()).toEqual(['A', 'C', 'D'])
})

test('a season with no weeks played leaves performance and impact unknown', () => {
  const rows = seasonOutcomes({ ...input, complete: false, matchupsByWeek: {} })
  const a = rows.find((r) => r.playerId === 'A')!
  expect(a.finishRank).toBeNull()
  expect(a.performance).toBeNull()
  expect(a.impactShare).toBeNull()
  expect(a.draftValue).toBe(2.5)
})

test('scoreKeepers averages percentiles over the known parts', () => {
  const scored = scoreKeepers(seasonOutcomes(input))
  const a = scored.find((r) => r.playerId === 'A')!
  const d = scored.find((r) => r.playerId === 'D')!
  // A is the better keeper on all three parts; D the worse.
  expect(a.score).toBe(100)
  expect(d.score).toBe(0)

  // Give D the draft-day bargain instead: the score is the mean of the three parts.
  const mixed = scoreKeepers(
    seasonOutcomes({
      ...input,
      adpByName: new Map([
        ['player a', 10],
        ['player d', 1],
      ]),
    }),
  )
  expect(mixed.find((r) => r.playerId === 'A')!.draftValue).toBe(-6)
  expect(mixed.find((r) => r.playerId === 'D')!.draftValue).toBe(1)
  expect(mixed.find((r) => r.playerId === 'A')!.score).toBe(67)
  expect(mixed.find((r) => r.playerId === 'D')!.score).toBe(33)

  // With ADP missing, the score is the mean of the two remaining parts.
  const noAdp = scoreKeepers(seasonOutcomes({ ...input, adpByName: new Map() }))
  expect(noAdp.find((r) => r.playerId === 'A')!.score).toBe(100)
  expect(noAdp.find((r) => r.playerId === 'D')!.score).toBe(0)

  // A lone keeper sits at the middle.
  const lone = scoreKeepers(seasonOutcomes(input).slice(0, 1))
  expect(lone[0]!.score).toBe(50)
})

test('managerRecords aggregates per manager, best average first', () => {
  const scored = scoreKeepers(seasonOutcomes(input))
  const records = managerRecords(scored)
  expect(records.map((r) => r.ownerName)).toEqual(['Ann', 'Bob'])
  const ann = records[0]!
  expect(ann.keepers).toBe(1)
  expect(ann.seasons).toBe(1)
  expect(ann.avgScore).toBe(100)
  expect(ann.hits).toBe(1)
  expect(ann.best?.playerId).toBe('A')
  expect(ann.latestTeamName).toBe('Ann FC')
  const bob = records[1]!
  expect(bob.hits).toBe(0)
  expect(bob.avgDraftValue).toBe(-10)
})
