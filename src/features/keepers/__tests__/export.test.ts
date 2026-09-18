import { describe, expect, it } from 'vitest'
import { assembleFromLeagueId, createSleeperClient } from '../api'
import type { SleeperClient } from '../api'
import { computeEligibility } from '../engine'
import { boardCsv, boardMarkdown } from '../lib/export'
import { teamSelectionResult, toggleSelection, type Selections } from '../lib/selection'
import { fixtureFetch, playersDump } from './fixtures/sleeper'

function fixtureClient(): SleeperClient {
  const fetchFn = (async (input: RequestInfo | URL) =>
    new Response(JSON.stringify(fixtureFetch(String(input))), { status: 200 })) as typeof fetch
  return createSleeperClient({ fetchFn })
}

async function loadFixtureBoard() {
  const data = await assembleFromLeagueId(fixtureClient(), 'L2025', { playersDump })
  return { data, result: computeEligibility(data.engineInput) }
}

describe('selection', () => {
  it('toggles picks on and off', () => {
    let selections: Selections = {}
    selections = toggleSelection(selections, 1, 'p_own8')
    expect(selections[1]).toEqual(['p_own8'])
    selections = toggleSelection(selections, 1, 'p_own8')
    expect(selections[1]).toEqual([])
  })

  it('blocks a reclaim when the rostering team keeps the player (E4 interactively)', async () => {
    const { result } = await loadFixtureBoard()
    // p_acq: drafted by team 2, on team 1's final roster. Both teams select it.
    const selections: Selections = { 1: ['p_acq'], 2: ['p_acq'] }
    const team1 = teamSelectionResult(result, selections, 1)
    expect(team1.assignments).toEqual([{ playerId: 'p_acq', round: 5, cost: { kind: 'default' } }])
    const team2 = teamSelectionResult(result, selections, 2)
    expect(team2.assignments).toEqual([])
    expect(team2.conflicts).toEqual([{ kind: 'claim-blocked', playerId: 'p_acq', keptBy: 1 }])
  })

  it("assigns a team's own round-5 pick and slides the default keeper to round 6 (E3 interactively)", async () => {
    const { result } = await loadFixtureBoard()
    const selections: Selections = { 1: ['p_own5', 'p_acq'] }
    const team1 = teamSelectionResult(result, selections, 1)
    expect(team1.conflicts).toEqual([])
    expect(team1.assignments).toEqual([
      { playerId: 'p_own5', round: 5, cost: { kind: 'draft-position', round: 5 } },
      { playerId: 'p_acq', round: 6, cost: { kind: 'default' } },
    ])
  })
})

describe('export', () => {
  it('renders the full board as markdown with claims, selections, and disqualifications', async () => {
    const { data, result } = await loadFixtureBoard()
    const markdown = boardMarkdown(data, result, { 1: ['p_own8'] })
    expect(markdown).toContain('# Fixture Keeper League — 2025 keeper options')
    expect(markdown).toContain("## Alice's Aces")
    expect(markdown).toContain('| Elena Eighth (TE) | R8 | your draft pick |')
    expect(markdown).toContain("only if Alice's Aces declines")
    expect(markdown).toContain('- Round 8: Elena Eighth (TE)')
    expect(markdown).toContain('Kai Holdover (RB) — kept last season (Rule 1.1)')
    expect(markdown).toContain('Wally Wirefind (WR)')
  })

  it('renders CSV with one row per claim and disqualification', async () => {
    const { data, result } = await loadFixtureBoard()
    const csv = boardCsv(data, result)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('team,player,position,status,cost,basis,contingent_on')
    expect(lines).toHaveLength(1 + result.claims.length + result.disqualified.length)
    expect(csv).toContain("Alice's Aces,Elena Eighth,TE,eligible,R8,your draft pick,")
    expect(csv).toContain("Ash Acquired,WR,eligible,R5→R6,reclaim if declined,Alice's Aces")
  })
})
