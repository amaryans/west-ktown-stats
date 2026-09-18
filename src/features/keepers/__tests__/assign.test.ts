import { describe, expect, it } from 'vitest'
import type { KeeperClaim } from '../engine'
import { assignRounds, claimsForTeam, computeEligibility, LEAGUE_RULES } from '../engine'
import { makeInput } from './helpers'

const claim = (
  partial: Partial<KeeperClaim> & Pick<KeeperClaim, 'playerId' | 'cost'>,
): KeeperClaim => ({
  teamId: 1,
  rule: partial.cost.kind === 'draft-position' ? '3.1.1' : '3.1.2',
  ...partial,
})

describe('assignRounds — docs/keeper-rules.md fixtures', () => {
  it('E3 (3.1.2 overflow): a default-cost keeper slides to round 6 when a 3.1.1 keeper occupies round 5', () => {
    const result = computeEligibility(
      makeInput({
        draftPicks: [
          { playerId: 'Q', teamId: 1, round: 5, isKeeper: false },
          { playerId: 'P', teamId: 2, round: 10, isKeeper: false },
        ],
        finalRosters: { 1: ['Q', 'P'] },
      }),
    )
    const { assignments, conflicts } = assignRounds(claimsForTeam(result, 1))
    expect(conflicts).toEqual([])
    expect(assignments).toEqual([
      { playerId: 'Q', round: 5, cost: { kind: 'draft-position', round: 5 } },
      { playerId: 'P', round: 6, cost: { kind: 'default' } },
    ])
  })

  it("E4 (3.2.1 blocks reclaim): the drafter's contingent claim dies when the roster team keeps the player", () => {
    const result = computeEligibility(
      makeInput({
        draftPicks: [{ playerId: 'P', teamId: 1, round: 7, isKeeper: false }],
        finalRosters: { 2: ['P'] },
      }),
    )
    const team2 = assignRounds(claimsForTeam(result, 2))
    expect(team2.assignments).toEqual([{ playerId: 'P', round: 5, cost: { kind: 'default' } }])

    const team1 = assignRounds(claimsForTeam(result, 1), LEAGUE_RULES, new Set(['P']))
    expect(team1.assignments).toEqual([])
    expect(team1.conflicts).toEqual([{ kind: 'claim-blocked', playerId: 'P', keptBy: 2 }])
  })

  it('E5 (3.2.2): a waived-through reclaim costs the default round, not the original round 11', () => {
    const result = computeEligibility(
      makeInput({
        draftPicks: [{ playerId: 'P', teamId: 1, round: 11, isKeeper: false }],
        finalRosters: { 2: ['P'] },
      }),
    )
    const team1 = assignRounds(claimsForTeam(result, 1))
    expect(team1.conflicts).toEqual([])
    expect(team1.assignments).toEqual([{ playerId: 'P', round: 5, cost: { kind: 'default' } }])
  })

  it('two default-cost keepers fill rounds 5 and 6 in selection order', () => {
    const { assignments, conflicts } = assignRounds([
      claim({ playerId: 'A', cost: { kind: 'default' } }),
      claim({ playerId: 'B', cost: { kind: 'default' } }),
    ])
    expect(conflicts).toEqual([])
    expect(assignments).toEqual([
      { playerId: 'A', round: 5, cost: { kind: 'default' } },
      { playerId: 'B', round: 6, cost: { kind: 'default' } },
    ])
  })

  it('R2: no slide past round 6 — a default-cost keeper with rounds 5 and 6 occupied is a conflict', () => {
    const { assignments, conflicts } = assignRounds([
      claim({ playerId: 'A', cost: { kind: 'draft-position', round: 5 } }),
      claim({ playerId: 'B', cost: { kind: 'draft-position', round: 6 } }),
      claim({ playerId: 'C', cost: { kind: 'default' } }),
    ])
    expect(assignments).toEqual([
      { playerId: 'A', round: 5, cost: { kind: 'draft-position', round: 5 } },
      { playerId: 'B', round: 6, cost: { kind: 'draft-position', round: 6 } },
    ])
    expect(conflicts).toContainEqual({
      kind: 'no-default-round-available',
      playerId: 'C',
      occupiedRounds: [5, 6],
    })
  })

  it('R3: selecting more than 2 keepers is flagged', () => {
    const { conflicts } = assignRounds([
      claim({ playerId: 'A', cost: { kind: 'default' } }),
      claim({ playerId: 'B', cost: { kind: 'draft-position', round: 8 } }),
      claim({ playerId: 'C', cost: { kind: 'draft-position', round: 9 } }),
    ])
    expect(conflicts).toContainEqual({ kind: 'over-max-keepers', limit: 2, selected: 3 })
  })

  it('R4 guard: two draft-position keepers at the same round are flagged, neither assigned', () => {
    const { assignments, conflicts } = assignRounds([
      claim({ playerId: 'A', cost: { kind: 'draft-position', round: 9 } }),
      claim({ playerId: 'B', cost: { kind: 'draft-position', round: 9 } }),
    ])
    expect(assignments).toEqual([])
    expect(conflicts).toEqual([{ kind: 'duplicate-draft-round', round: 9, playerIds: ['A', 'B'] }])
  })
})
