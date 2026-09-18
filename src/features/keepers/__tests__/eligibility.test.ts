import { describe, expect, it } from 'vitest'
import { computeEligibility } from '../engine'
import { makeInput } from './helpers'

describe('computeEligibility — docs/keeper-rules.md fixtures', () => {
  it('E1 (3.1.1): own draftee on final roster is keepable at draft position', () => {
    const result = computeEligibility(
      makeInput({
        draftPicks: [{ playerId: 'P', teamId: 1, round: 8, isKeeper: false }],
        finalRosters: { 1: ['P'] },
      }),
    )
    expect(result.disqualified).toEqual([])
    expect(result.claims).toEqual([
      { playerId: 'P', teamId: 1, cost: { kind: 'draft-position', round: 8 }, rule: '3.1.1' },
    ])
  })

  it("E2 (3.1.2): another team's draftee on your final roster is keepable at default cost, with a contingent reclaim for the drafter", () => {
    const result = computeEligibility(
      makeInput({
        draftPicks: [{ playerId: 'P', teamId: 2, round: 8, isKeeper: false }],
        finalRosters: { 1: ['P'] },
      }),
    )
    expect(result.disqualified).toEqual([])
    expect(result.claims).toEqual([
      { playerId: 'P', teamId: 1, cost: { kind: 'default' }, rule: '3.1.2' },
      {
        playerId: 'P',
        teamId: 2,
        cost: { kind: 'default' },
        rule: '3.2.2',
        contingentOnDeclineBy: 1,
      },
    ])
  })

  it('E6 (1.1): a player kept last season is disqualified for everyone, taking priority over 1.2', () => {
    const result = computeEligibility(
      makeInput({
        draftPicks: [{ playerId: 'P', teamId: 1, round: 3, isKeeper: true }],
        finalRosters: { 1: ['P'] },
        previousKeepers: new Set(['P']),
      }),
    )
    expect(result.claims).toEqual([])
    expect(result.disqualified).toEqual([{ playerId: 'P', reason: 'kept-last-season' }])
  })

  it('E6 variant: disqualification is league-wide — no roster or reclaim claim survives', () => {
    const result = computeEligibility(
      makeInput({
        draftPicks: [{ playerId: 'P', teamId: 1, round: 7, isKeeper: true }],
        finalRosters: { 2: ['P'] },
        previousKeepers: new Set(['P']),
      }),
    )
    expect(result.claims).toEqual([])
    expect(result.disqualified).toEqual([{ playerId: 'P', reason: 'kept-last-season' }])
  })

  it('E7 (1.2): drafted in rounds 1–4 disqualifies; round 5 is the first eligible round', () => {
    const result = computeEligibility(
      makeInput({
        draftPicks: [
          { playerId: 'P4', teamId: 1, round: 4, isKeeper: false },
          { playerId: 'P5', teamId: 1, round: 5, isKeeper: false },
        ],
        finalRosters: { 1: ['P4', 'P5'] },
      }),
    )
    expect(result.disqualified).toEqual([{ playerId: 'P4', reason: 'drafted-rounds-1-4' }])
    expect(result.claims).toEqual([
      { playerId: 'P5', teamId: 1, cost: { kind: 'draft-position', round: 5 }, rule: '3.1.1' },
    ])
  })

  it('E8 (3.2.3): a drafted player who ended the season a free agent is reclaimable by the drafter at default cost', () => {
    const result = computeEligibility(
      makeInput({
        draftPicks: [{ playerId: 'P', teamId: 1, round: 9, isKeeper: false }],
        finalRosters: {},
      }),
    )
    expect(result.claims).toEqual([
      { playerId: 'P', teamId: 1, cost: { kind: 'default' }, rule: '3.2.3' },
    ])
  })

  it('R1: an undrafted pickup on the final roster is keepable at default cost', () => {
    const result = computeEligibility(
      makeInput({
        finalRosters: { 1: ['U'] },
      }),
    )
    expect(result.claims).toEqual([
      { playerId: 'U', teamId: 1, cost: { kind: 'default' }, rule: '3.1.2' },
    ])
  })

  it('a player with no draft pick and no roster spot is not a candidate at all', () => {
    const result = computeEligibility(makeInput({}))
    expect(result.claims).toEqual([])
    expect(result.disqualified).toEqual([])
  })

  it('every player has at most one unconditional claim; contingent claims always name the blocking team', () => {
    const result = computeEligibility(
      makeInput({
        draftPicks: [
          { playerId: 'A', teamId: 1, round: 6, isKeeper: false },
          { playerId: 'B', teamId: 2, round: 7, isKeeper: false },
          { playerId: 'C', teamId: 2, round: 9, isKeeper: false },
        ],
        finalRosters: { 1: ['A', 'B'], 2: ['U'] },
      }),
    )
    const unconditional = result.claims.filter((c) => c.contingentOnDeclineBy === undefined)
    const perPlayer = new Map<string, number>()
    for (const claim of unconditional) {
      perPlayer.set(claim.playerId, (perPlayer.get(claim.playerId) ?? 0) + 1)
    }
    for (const count of perPlayer.values()) expect(count).toBe(1)
    for (const claim of result.claims) {
      if (claim.rule === '3.2.2') expect(claim.contingentOnDeclineBy).toBeDefined()
      else expect(claim.contingentOnDeclineBy).toBeUndefined()
    }
  })
})
