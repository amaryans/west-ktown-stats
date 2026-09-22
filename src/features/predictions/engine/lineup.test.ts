import { describe, expect, it } from 'vitest'
import { assign, inferByeTeams, optimalLineup, startingSlots } from './lineup.ts'
import type { ProjectedPlayer } from './types.ts'

function player(id: string, positions: string[], team: string | null = 'KC'): ProjectedPlayer {
  return { playerId: id, name: id, positions, team }
}

describe('assign', () => {
  it('picks the maximum-weight matching', () => {
    // Rows = slots, columns = players; -1 marks ineligible.
    const chosen = assign([
      [10, -1, 5],
      [-1, 8, 9],
    ])
    expect(chosen).toEqual([0, 2])
  })

  it('leaves a slot empty when no eligible player exists', () => {
    expect(assign([[-1, -1]])).toEqual([-1])
  })

  it('handles more slots than players', () => {
    expect(assign([[4], [3]])).toEqual([0, -1])
  })
})

describe('optimalLineup', () => {
  const players: Record<string, ProjectedPlayer> = {
    qb1: player('qb1', ['QB']),
    rb1: player('rb1', ['RB']),
    rb2: player('rb2', ['RB']),
    rb3: player('rb3', ['RB']),
    wr1: player('wr1', ['WR']),
    wr2: player('wr2', ['WR']),
    wr3: player('wr3', ['WR']),
    te1: player('te1', ['TE'], 'DET'),
    k1: player('k1', ['K']),
    def: player('def', ['DEF']),
    ir1: player('ir1', ['WR']),
  }
  const roster = {
    rosterId: 1,
    players: Object.keys(players),
    unavailable: ['ir1'],
  }
  const positions = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'IR']

  it('starts the best eligible players and puts the next best in flex', () => {
    const lineup = optimalLineup({
      roster,
      rosterPositions: positions,
      projections: {
        qb1: 20,
        rb1: 15,
        rb2: 12,
        rb3: 11,
        wr1: 14,
        wr2: 9,
        wr3: 8,
        te1: 7,
        k1: 8,
        def: 6,
        ir1: 30,
      },
      players,
      byeTeams: new Set(),
    })
    const byId = Object.fromEntries(lineup.slots.map((s) => [s.slot + s.playerId, s.points]))
    expect(byId['FLEXrb3']).toBe(11)
    expect(lineup.total).toBe(20 + 15 + 12 + 14 + 9 + 7 + 11 + 8 + 6)
    expect(lineup.emptySlots).toBe(0)
    expect(lineup.bench.map((b) => b.playerId)).toEqual(['wr3'])
    // IR players are never considered.
    expect(lineup.slots.some((s) => s.playerId === 'ir1')).toBe(false)
  })

  it('benches players on bye and flags the empty slot', () => {
    const lineup = optimalLineup({
      roster,
      rosterPositions: positions,
      projections: { qb1: 20, rb1: 15, rb2: 12, rb3: 11, wr1: 14, wr2: 9, wr3: 8, k1: 8, def: 6 },
      players,
      byeTeams: new Set(['DET']),
    })
    expect(lineup.byes).toEqual(['te1'])
    expect(lineup.slots.find((s) => s.slot === 'TE')?.playerId).toBeNull()
    expect(lineup.emptySlots).toBe(1)
    expect(lineup.bench.find((b) => b.playerId === 'te1')?.onBye).toBe(true)
  })

  it('solves the two-flex case that greedy filling gets wrong', () => {
    const p: Record<string, ProjectedPlayer> = {
      wr: player('wr', ['WR']),
      rb: player('rb', ['RB']),
      te: player('te', ['TE']),
    }
    const lineup = optimalLineup({
      roster: { rosterId: 2, players: ['wr', 'rb', 'te'] },
      rosterPositions: ['FLEX', 'REC_FLEX'],
      projections: { wr: 12, rb: 11, te: 5 },
      players: p,
      byeTeams: new Set(),
    })
    expect(lineup.total).toBe(23)
  })

  it('ignores players with no projection', () => {
    const lineup = optimalLineup({
      roster: { rosterId: 3, players: ['qb1', 'unknown'] },
      rosterPositions: ['QB', 'BN'],
      projections: { qb1: 18 },
      players: { qb1: players.qb1 },
      byeTeams: new Set(),
    })
    expect(lineup.total).toBe(18)
    expect(lineup.bench).toEqual([{ playerId: 'unknown', points: 0, onBye: false }])
  })
})

describe('helpers', () => {
  it('startingSlots drops bench, IR and taxi', () => {
    expect(startingSlots(['QB', 'BN', 'IR', 'TAXI', 'FLEX'])).toEqual(['QB', 'FLEX'])
  })

  it('inferByeTeams names teams without any projected points', () => {
    const players = { a: player('a', ['QB'], 'KC'), b: player('b', ['RB'], 'DET') }
    expect(inferByeTeams({ a: 20, b: 0 }, players, ['KC', 'DET', 'SF'])).toEqual(
      new Set(['DET', 'SF']),
    )
  })
})
