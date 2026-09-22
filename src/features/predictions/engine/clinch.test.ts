import { describe, expect, it } from 'vitest'
import { clinchStatuses } from './clinch.ts'
import type { RecordInput, ScheduledGame } from './types.ts'

const team = (rosterId: number, wins: number, losses: number): RecordInput => ({
  rosterId,
  wins,
  losses,
  ties: 0,
  pointsFor: 0,
})

/** Round-robin style: every remaining week each team plays once. */
function roundRobin(weeks: number[], pairs: [number, number][][]): ScheduledGame[] {
  return weeks.flatMap((week, i) => (pairs[i] ?? []).map(([home, away]) => ({ week, home, away })))
}

describe('clinchStatuses', () => {
  it('marks a runaway leader clinched and a hopeless team eliminated', () => {
    const teams = [team(1, 9, 1), team(2, 5, 5), team(3, 5, 5), team(4, 1, 9)]
    const schedule = roundRobin(
      [11, 12],
      [
        [
          [1, 2],
          [3, 4],
        ],
        [
          [1, 3],
          [2, 4],
        ],
      ],
    )
    const s = clinchStatuses({
      teams,
      schedule,
      weeks: [11, 12],
      medianGame: false,
      spots: 2,
      byes: 0,
    })
    const one = s.find((t) => t.rosterId === 1)
    const four = s.find((t) => t.rosterId === 4)
    expect(one?.clinchedPlayoffs).toBe(true)
    expect(one?.magicNumber).toBe(0)
    expect(one?.eliminated).toBe(false)
    expect(four?.eliminated).toBe(true)
    expect(four?.clinchedPlayoffs).toBe(false)
    expect(four?.magicNumber).toBeNull()
    const two = s.find((t) => t.rosterId === 2)
    expect(two?.clinchedPlayoffs).toBe(false)
    expect(two?.eliminated).toBe(false)
    // Team 3 can reach 7 wins; team 2 needs 8 to be safe from it on wins alone.
    expect(two?.magicNumber).toBe(3)
  })

  it('sees that two rivals cannot both catch up when they play each other', () => {
    // Team 1 sits on 6 wins with no games left. Teams 2 and 3 have 5 wins and
    // one game left: against each other. Only one can reach 6, so with two
    // spots team 1 is safe even though each rival could catch it alone.
    const teams = [team(1, 6, 4), team(2, 5, 4), team(3, 5, 4), team(4, 0, 9)]
    const schedule: ScheduledGame[] = [
      { week: 11, home: 2, away: 3 },
      { week: 11, home: 4, away: 1 },
    ]
    const s = clinchStatuses({ teams, schedule, weeks: [11], medianGame: false, spots: 2, byes: 0 })
    expect(s.find((t) => t.rosterId === 1)?.clinchedPlayoffs).toBe(true)
    // The naive magic number still says one more result is needed.
    expect(s.find((t) => t.rosterId === 1)?.magicNumber).toBe(0)
  })

  it('does not eliminate a team the schedule can still rescue', () => {
    // Team 4 has 4 wins and one game left; 2 and 3 have 4 wins and play each
    // other, so one of them must stay on 4 and team 4 can pass it.
    const teams = [team(1, 8, 1), team(2, 4, 5), team(3, 4, 5), team(4, 4, 5)]
    const schedule: ScheduledGame[] = [
      { week: 11, home: 2, away: 3 },
      { week: 11, home: 4, away: 1 },
    ]
    const s = clinchStatuses({ teams, schedule, weeks: [11], medianGame: false, spots: 2, byes: 0 })
    const four = s.find((t) => t.rosterId === 4)
    expect(four?.eliminated).toBe(false)
    expect(four?.clinchedPlayoffs).toBe(false)
    // A loss plus a rival win would end it.
    expect(four?.eliminationNumber).toBe(2)
    // With only one spot, team 1 has it and team 4 is out.
    const one = clinchStatuses({
      teams,
      schedule,
      weeks: [11],
      medianGame: false,
      spots: 1,
      byes: 0,
    })
    expect(one.find((t) => t.rosterId === 1)?.clinchedPlayoffs).toBe(true)
    expect(one.find((t) => t.rosterId === 4)?.eliminated).toBe(true)
  })

  it("eliminates a team when the rivals' own game must lift one of them past it", () => {
    // Team 4 tops out at 4 wins; 2 and 3 have 4 and play each other, so the
    // winner reaches 5 and, with team 1, fills both spots.
    const teams = [team(1, 8, 1), team(2, 4, 5), team(3, 4, 5), team(4, 3, 6)]
    const schedule: ScheduledGame[] = [
      { week: 11, home: 2, away: 3 },
      { week: 11, home: 4, away: 1 },
    ]
    const s = clinchStatuses({ teams, schedule, weeks: [11], medianGame: false, spots: 2, byes: 0 })
    expect(s.find((t) => t.rosterId === 4)?.eliminated).toBe(true)
  })

  it('counts median games as extra games', () => {
    const teams = [team(1, 12, 2), team(2, 8, 6), team(3, 8, 6), team(4, 2, 12)]
    const schedule: ScheduledGame[] = [
      { week: 8, home: 1, away: 4 },
      { week: 8, home: 2, away: 3 },
    ]
    const s = clinchStatuses({ teams, schedule, weeks: [8], medianGame: true, spots: 2, byes: 1 })
    const one = s.find((t) => t.rosterId === 1)
    expect(one?.remainingGames).toBe(2)
    expect(one?.clinchedPlayoffs).toBe(true)
    expect(one?.clinchedBye).toBe(true)
    // Teams 2 and 3 can both win the median game, but only one wins their head-to-head.
    const two = s.find((t) => t.rosterId === 2)
    expect(two?.clinchedPlayoffs).toBe(false)
    expect(two?.eliminated).toBe(false)
  })

  it('handles a finished season', () => {
    const teams = [team(1, 10, 4), team(2, 9, 5), team(3, 9, 5), team(4, 0, 14)]
    const s = clinchStatuses({
      teams,
      schedule: [],
      weeks: [],
      medianGame: false,
      spots: 2,
      byes: 0,
    })
    expect(s.find((t) => t.rosterId === 1)?.clinchedPlayoffs).toBe(true)
    // 2 and 3 are tied on wins; points for decides, so neither is clinched nor eliminated.
    expect(s.find((t) => t.rosterId === 2)?.clinchedPlayoffs).toBe(false)
    expect(s.find((t) => t.rosterId === 2)?.eliminated).toBe(false)
    expect(s.find((t) => t.rosterId === 4)?.eliminated).toBe(true)
  })
})
