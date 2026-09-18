import { finalDraftOrder, revealedTeamIds, useAppStore } from './store.ts'
import type { League, Team } from '../data/types.ts'

function makeTeam(id: string, wins: number): Team {
  return {
    id,
    ownerName: `owner-${id}`,
    teamName: `team-${id}`,
    wins,
    losses: 14 - wins,
    ties: 0,
    pointsFor: 1000 + wins * 10,
    avatarUrl: null,
    playoffFinish: null,
  }
}

function makeLeague(teamCount = 10): League {
  return {
    source: 'manual',
    name: 'Test League',
    teams: Array.from({ length: teamCount }, (_, i) => makeTeam(`t${i + 1}`, i)),
  }
}

beforeEach(() => {
  localStorage.clear()
  useAppStore.getState().startOver()
})

describe('phase machine', () => {
  test('starts in setup', () => {
    expect(useAppStore.getState().phase).toBe('setup')
  })

  test('setLeague advances to review', () => {
    useAppStore.getState().setLeague(makeLeague())
    expect(useAppStore.getState().phase).toBe('review')
    expect(useAppStore.getState().league?.teams).toHaveLength(10)
  })

  test('startLottery produces a result and enters event', () => {
    useAppStore.getState().setLeague(makeLeague())
    useAppStore.getState().startLottery()
    const state = useAppStore.getState()
    expect(state.phase).toBe('event')
    expect(state.result?.pickOrder).toHaveLength(10)
    expect(state.lotteryConfig?.oddsBps.reduce((a, b) => a + b, 0)).toBe(10000)
  })

  test('startLottery throws without a league', () => {
    expect(() => useAppStore.getState().startLottery()).toThrow(/without a league/)
  })

  test('startOver clears everything', () => {
    useAppStore.getState().setLeague(makeLeague())
    useAppStore.getState().startLottery()
    useAppStore.getState().startOver()
    const state = useAppStore.getState()
    expect(state.phase).toBe('setup')
    expect(state.league).toBeNull()
    expect(state.result).toBeNull()
  })
})

describe('reveal flow', () => {
  test('reveals run from pick 1 to the last pick', () => {
    useAppStore.getState().setLeague(makeLeague(4))
    useAppStore.getState().startLottery()
    const pickOrder = useAppStore.getState().result?.pickOrder ?? []
    useAppStore.getState().revealNext()
    expect(revealedTeamIds(useAppStore.getState())).toEqual([pickOrder[0]])
    useAppStore.getState().revealNext()
    expect(revealedTeamIds(useAppStore.getState())).toEqual([pickOrder[0], pickOrder[1]])
  })

  test('revealNext stops at the total pick count', () => {
    useAppStore.getState().setLeague(makeLeague(4))
    useAppStore.getState().startLottery()
    for (let i = 0; i < 10; i++) {
      useAppStore.getState().revealNext()
    }
    expect(useAppStore.getState().revealCursor).toBe(4)
  })

  test('undoSlotAssignment unlocks the last slot without hiding the reveal', () => {
    useAppStore.getState().setLeague(makeLeague(4))
    useAppStore.getState().startLottery()
    useAppStore.getState().revealNext()
    const revealed = revealedTeamIds(useAppStore.getState())[0] as string
    useAppStore.getState().assignSlot(revealed, 4)
    useAppStore.getState().undoSlotAssignment()
    const state = useAppStore.getState()
    expect(state.revealCursor).toBe(1)
    expect(state.slotAssignments).toHaveLength(0)
  })
})

describe('slot assignments', () => {
  test('rejects taken slots and double assignment', () => {
    useAppStore.getState().setLeague(makeLeague(4))
    useAppStore.getState().startLottery()
    useAppStore.getState().assignSlot('t1', 1)
    useAppStore.getState().assignSlot('t2', 1) // slot taken
    useAppStore.getState().assignSlot('t1', 2) // team already assigned
    expect(useAppStore.getState().slotAssignments).toEqual([{ teamId: 't1', slot: 1 }])
  })

  test('rejects out-of-range slots', () => {
    useAppStore.getState().setLeague(makeLeague(4))
    useAppStore.getState().startLottery()
    useAppStore.getState().assignSlot('t1', 0)
    useAppStore.getState().assignSlot('t1', 5)
    expect(useAppStore.getState().slotAssignments).toHaveLength(0)
  })
})

describe('finalDraftOrder', () => {
  test('lotteryIsOrder mode: order equals pick order', () => {
    useAppStore.getState().setLeague(makeLeague(4))
    useAppStore.getState().updateSettings({ slotMode: 'lotteryIsOrder' })
    useAppStore.getState().startLottery()
    const state = useAppStore.getState()
    const order = finalDraftOrder(state)
    expect(order?.map((t) => t.id)).toEqual(state.result?.pickOrder)
  })

  test('winnerChoosesSlot mode: incomplete until all slots assigned', () => {
    useAppStore.getState().setLeague(makeLeague(3))
    useAppStore.getState().startLottery()
    expect(finalDraftOrder(useAppStore.getState())).toBeNull()
    useAppStore.getState().assignSlot('t1', 2)
    useAppStore.getState().assignSlot('t2', 3)
    useAppStore.getState().assignSlot('t3', 1)
    const order = finalDraftOrder(useAppStore.getState())
    expect(order?.map((t) => t.id)).toEqual(['t3', 't1', 't2'])
  })
})

describe('persistence', () => {
  test('state persists to the versioned localStorage key', () => {
    useAppStore.getState().setLeague(makeLeague())
    const raw = localStorage.getItem('ffl.v1')
    expect(raw).not.toBeNull()
    const persisted = JSON.parse(raw as string) as { state: { phase: string }; version: number }
    expect(persisted.version).toBe(1)
    expect(persisted.state.phase).toBe('review')
  })
})
