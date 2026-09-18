import { describe, expect, it } from 'vitest'
import {
  assembleFromLeagueId,
  createSleeperClient,
  SleeperApiError,
  UnsupportedLeagueError,
  withKeeperEdits,
} from '../api'
import type { SleeperClient, SleeperDraftPick } from '../api'
import { claimsForTeam, computeEligibility } from '../engine'
import { DRAFT_START, drafts2024, fixtureFetch, playersDump } from './fixtures/sleeper'

function fixtureClient(overrides?: (url: string) => unknown): SleeperClient {
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = overrides?.(url) ?? fixtureFetch(url)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return createSleeperClient({ fetchFn })
}

describe('sleeper client', () => {
  it("treats Sleeper's 200-with-null response as a not-found error", async () => {
    await expect(fixtureClient().getLeague('does-not-exist')).rejects.toThrow(SleeperApiError)
  })
})

describe('assembleFromLeagueId', () => {
  it('resolves the upcoming league to its completed previous season', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025')
    expect(data.enteredLeague.id).toBe('L2025')
    expect(data.previousLeague).toEqual({
      id: 'L2024',
      name: 'Fixture Keeper League',
      season: '2024',
    })
    expect(data.upcomingSeason).toBe('2025')
    expect(data.draft).toEqual({ id: 'D2024', type: 'snake', rounds: 15, startTime: DRAFT_START })
  })

  it('treats an entered completed league as the previous season directly', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2024')
    expect(data.previousLeague.id).toBe('L2024')
    expect(data.upcomingSeason).toBe('2025')
  })

  it('maps teams with team-name > display-name precedence', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025')
    expect(data.engineInput.teams).toEqual([
      { id: 1, name: "Alice's Aces", ownerId: 'u1' },
      { id: 2, name: 'Bob', ownerId: 'u2' },
      { id: 3, name: 'Cara', ownerId: 'u3' },
      { id: 4, name: 'Dan', ownerId: 'u4' },
    ])
  })

  it('maps picks to rosters, using the draft-slot fallback when roster_id is null', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025')
    const own8 = data.engineInput.draftPicks.find((pick) => pick.playerId === 'p_own8')
    expect(own8).toEqual({ playerId: 'p_own8', teamId: 1, round: 8, isKeeper: false })
    expect(data.warnings).toContainEqual(expect.stringContaining('draft-slot fallback'))
  })

  it('auto-detects previous keepers from is_keeper flags and pre-draft rosters', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025')
    expect(data.autoDetectedKeepers).toEqual(['p_kept', 'p_early', 'p_prek', 'p_tk'])
    expect(data.keeperDetection).toContainEqual({ playerId: 'p_kept', source: 'keeper-flag' })
    expect(data.engineInput.previousKeepers.has('p_kept')).toBe(true)
    expect(data.engineInput.previousKeepers.has('p_prek')).toBe(true)
  })

  it('detects pre-boarded players even when they were also drafted', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025')
    expect(data.keeperDetection).toContainEqual({
      playerId: 'p_early',
      source: 'pre-draft-roster',
      teamId: 2,
    })
    expect(data.engineInput.previousKeepers.has('p_early')).toBe(true)
  })

  it('detects a player placed on a roster before the draft as a keeper', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025')
    expect(data.keeperDetection).toContainEqual({
      playerId: 'p_prek',
      source: 'pre-draft-roster',
      teamId: 3,
    })
  })

  it('ignores trades when deciding how a player entered rosters', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025')
    // p_tk was on the board pre-draft and only ever moved via trade.
    expect(data.keeperDetection).toContainEqual({
      playerId: 'p_tk',
      source: 'pre-draft-roster',
      teamId: 1,
    })
  })

  it('does not flag post-draft pickups as keepers', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025')
    expect(data.autoDetectedKeepers).not.toContain('p_wire')
  })

  it('reports skipped draft slots on a full-enough board', async () => {
    const miniPicks: SleeperDraftPick[] = []
    let pickNo = 0
    for (let round = 1; round <= 2; round += 1) {
      for (let slot = 1; slot <= 4; slot += 1) {
        pickNo += 1
        if (round === 2 && slot === 3) continue // the keeper slot nobody picked at
        miniPicks.push({
          player_id: `p_r${round}s${slot}`,
          picked_by: '',
          roster_id: slot,
          round,
          pick_no: pickNo,
          draft_slot: slot,
          is_keeper: null,
          metadata: null,
        })
      }
    }
    const client = fixtureClient((url) => {
      if (url.endsWith('/league/L2024/drafts')) {
        return [{ ...drafts2024[0], settings: { rounds: 2 } }]
      }
      if (url.endsWith('/draft/D2024/picks')) return miniPicks
      return undefined
    })
    const data = await assembleFromLeagueId(client, 'L2025')
    expect(data.skippedDraftSlots).toEqual([{ round: 2, slot: 3, teamId: 3 }])
  })

  it('names drafted players from pick metadata and undrafted players from the dump', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025', { playersDump })
    expect(data.playerInfo['p_own5']).toEqual({
      name: 'Otto Fifth',
      position: 'WR',
      nflTeam: 'KC',
    })
    expect(data.playerInfo['p_wire']).toEqual({
      name: 'Wally Wirefind',
      position: 'WR',
      nflTeam: 'MIA',
    })
  })

  it('rejects auction drafts per ruling R8', async () => {
    const auction = fixtureClient((url) =>
      url.endsWith('/league/L2024/drafts') ? [{ ...drafts2024[0], type: 'auction' }] : undefined,
    )
    await expect(assembleFromLeagueId(auction, 'L2025')).rejects.toThrow(UnsupportedLeagueError)
  })

  it('rejects an incomplete league with no previous-season link', async () => {
    const unlinked = fixtureClient((url) =>
      url.endsWith('/league/L2025')
        ? {
            league_id: 'L2025',
            name: 'X',
            season: '2025',
            status: 'pre_draft',
            sport: 'nfl',
            total_rosters: 4,
            previous_league_id: null,
            draft_id: null,
          }
        : undefined,
    )
    await expect(assembleFromLeagueId(unlinked, 'L2025')).rejects.toThrow(UnsupportedLeagueError)
  })

  it('feeds the engine end to end: fixture league produces the expected board', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025')
    const result = computeEligibility(data.engineInput)

    expect(result.disqualified).toEqual([
      { playerId: 'p_early', reason: 'kept-last-season' },
      { playerId: 'p_kept', reason: 'kept-last-season' },
      { playerId: 'p_prek', reason: 'kept-last-season' },
      { playerId: 'p_qb1', reason: 'drafted-rounds-1-4' },
      { playerId: 'p_tk', reason: 'kept-last-season' },
    ])

    expect(claimsForTeam(result, 1)).toEqual([
      { playerId: 'p_acq', teamId: 1, cost: { kind: 'default' }, rule: '3.1.2' },
      { playerId: 'p_own5', teamId: 1, cost: { kind: 'draft-position', round: 5 }, rule: '3.1.1' },
      { playerId: 'p_own8', teamId: 1, cost: { kind: 'draft-position', round: 8 }, rule: '3.1.1' },
    ])
    expect(claimsForTeam(result, 2)).toEqual([
      {
        playerId: 'p_acq',
        teamId: 2,
        cost: { kind: 'default' },
        rule: '3.2.2',
        contingentOnDeclineBy: 1,
      },
    ])
    expect(claimsForTeam(result, 3)).toEqual([
      { playerId: 'p_fa', teamId: 3, cost: { kind: 'default' }, rule: '3.2.3' },
    ])
    expect(claimsForTeam(result, 4)).toEqual([
      { playerId: 'p_wire', teamId: 4, cost: { kind: 'default' }, rule: '3.1.2' },
    ])
  })
})

describe('withKeeperEdits', () => {
  it('layers manual adds and removes onto auto-detection without mutating the input', async () => {
    const data = await assembleFromLeagueId(fixtureClient(), 'L2025')
    const edited = withKeeperEdits(data.engineInput, { add: ['p_own5'], remove: ['p_kept'] })
    expect(edited.previousKeepers.has('p_own5')).toBe(true)
    expect(edited.previousKeepers.has('p_kept')).toBe(false)
    expect(data.engineInput.previousKeepers.has('p_kept')).toBe(true)

    const result = computeEligibility(edited)
    expect(result.disqualified).toContainEqual({ playerId: 'p_own5', reason: 'kept-last-season' })
  })
})
