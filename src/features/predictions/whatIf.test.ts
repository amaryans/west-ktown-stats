import { describe, expect, it } from 'vitest'
import type { PredictionData } from './loader.ts'
import {
  favouritePicks,
  gameKey,
  medianKey,
  picksProblem,
  picksToResults,
  statusLabel,
  whatIf,
} from './whatIf.ts'

const team = (rosterId: number, wins: number, losses: number) =>
  ({
    rosterId,
    ownerId: `u${rosterId}`,
    ownerName: `O${rosterId}`,
    teamName: `T${rosterId}`,
    avatarSrc: null,
    record: { wins, losses, ties: 0 },
    h2h: { wins, losses, ties: 0 },
    pointsFor: 0,
    players: [],
    unavailable: [],
  }) as PredictionData['teams'][number]

const base = {
  teams: [team(1, 8, 2), team(2, 7, 3), team(3, 3, 7), team(4, 2, 8)],
  schedule: [
    { week: 11, home: 1, away: 3 },
    { week: 11, home: 2, away: 4 },
    { week: 12, home: 1, away: 2 },
    { week: 12, home: 3, away: 4 },
  ],
  remainingWeeks: [11, 12],
  medianGame: false,
  playoffTeams: 1,
  forecasts: {
    '1:11': { mean: 90, sd: 20 },
    '3:11': { mean: 110, sd: 20 },
    '2:11': { mean: 100, sd: 20 },
    '4:11': { mean: 80, sd: 20 },
  },
} as unknown as PredictionData

describe('whatIf', () => {
  it('turns picks into results and statuses', () => {
    const g1 = base.schedule[0]!
    const g2 = base.schedule[1]!
    const picks = { [gameKey(g1)]: 1, [gameKey(g2)]: 4 }
    expect(picksToResults(base, picks)).toEqual([
      { kind: 'game', week: 11, winner: 1, loser: 3 },
      { kind: 'game', week: 11, winner: 4, loser: 2 },
    ])
    const rows = whatIf(base, picks)
    expect(rows.map((r) => r.rosterId)).toEqual([1, 2, 3, 4])
    const one = rows[0]!
    expect([one.wins, one.losses]).toEqual([9, 2])
    expect(statusLabel(one.before)).toBe('Alive')
    expect(statusLabel(one.after)).toBe('Clinched')
    expect(one.changed).toBe(true)
    expect(statusLabel(rows[1]!.after)).toBe('Out')
    // Only one of the two games picked: team 2 can still tie, so nothing is decided.
    const half = whatIf(base, { [gameKey(g1)]: 1 })
    expect(half.every((r) => !r.changed || statusLabel(r.after) === 'Out')).toBe(true)
    expect(statusLabel(half.find((r) => r.rosterId === 1)!.after)).toBe('Alive')
  })

  it('picks favourites from the projections', () => {
    const picks = favouritePicks(base, 11)
    expect(picks[gameKey(base.schedule[0]!)]).toBe(3)
    expect(picks[gameKey(base.schedule[1]!)]).toBe(2)
    const median = favouritePicks({ ...base, medianGame: true }, 11)
    expect(median[medianKey(11, 3)]).toBe(true)
    expect(median[medianKey(11, 4)]).toBe(false)
  })

  it('flags impossible median picks', () => {
    const data = { ...base, medianGame: true }
    expect(picksProblem(data, { [medianKey(11, 1)]: true, [medianKey(11, 2)]: true })).toBeNull()
    expect(
      picksProblem(data, {
        [medianKey(11, 1)]: true,
        [medianKey(11, 2)]: true,
        [medianKey(11, 3)]: true,
      }),
    ).toMatch(/Only 2 teams can beat the median in week 11/)
  })
})
