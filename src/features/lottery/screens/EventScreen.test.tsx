import { act, fireEvent, render, screen } from '@testing-library/react'
import EventScreen from './EventScreen.tsx'
import { useAppStore } from '../state/store.ts'
import type { League, Team } from '../data/types.ts'

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
import confetti from 'canvas-confetti'

function makeTeam(id: string, wins: number): Team {
  return {
    id,
    ownerName: `owner-${id}`,
    teamName: `team-${id}`,
    wins,
    losses: 14 - wins,
    ties: 0,
    pointsFor: 1000 + wins,
    avatarUrl: null,
    playoffFinish: null,
  }
}

function makeLeague(): League {
  return {
    source: 'manual',
    name: 'Event Test League',
    teams: [makeTeam('a', 2), makeTeam('b', 7), makeTeam('c', 12)],
  }
}

function setupLottery(slotMode: 'winnerChoosesSlot' | 'lotteryIsOrder') {
  useAppStore.getState().setLeague(makeLeague())
  useAppStore.getState().updateSettings({ slotMode })
  useAppStore.getState().startLottery()
}

beforeEach(() => {
  localStorage.clear()
  useAppStore.getState().startOver()
  vi.clearAllMocks()
  // Only fake the setTimeout family: framer-motion relies on real
  // requestAnimationFrame/performance to make progress in jsdom.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
})

afterEach(() => {
  vi.useRealTimers()
})

/** Click "next" and run the drumroll out. */
async function revealOnePick() {
  fireEvent.click(screen.getByRole('button', { name: /reveal the #1 pick|next pick/i }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
}

describe('EventScreen', () => {
  test('reveals pick 1 first', async () => {
    setupLottery('lotteryIsOrder')
    render(<EventScreen />)

    const firstPickId = useAppStore.getState().result?.pickOrder[0] as string

    fireEvent.click(screen.getByRole('button', { name: /reveal the #1 pick/i }))
    expect(screen.getByRole('button', { name: /drawing/i })).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(useAppStore.getState().revealCursor).toBe(1)
    // The card mounts after AnimatePresence finishes the drumroll exit animation,
    // which runs on requestAnimationFrame — needs real timers to elapse.
    vi.useRealTimers()
    expect(await screen.findByTestId('revealed-card')).toHaveTextContent(`team-${firstPickId}`)
  })

  test('fires confetti on the #1 pick — the first reveal only', async () => {
    setupLottery('lotteryIsOrder')
    render(<EventScreen />)

    await revealOnePick()
    expect(confetti).toHaveBeenCalledTimes(1)
    await revealOnePick()
    await revealOnePick()
    expect(confetti).toHaveBeenCalledTimes(1)
  })

  test('winner must lock in a slot before the next pick', async () => {
    setupLottery('winnerChoosesSlot')
    render(<EventScreen />)

    await revealOnePick()

    // The next-pick button is blocked until the winner locks in a slot.
    expect(screen.getByRole('button', { name: /next pick/i })).toBeDisabled()

    // Selecting a slot is tentative — nothing is assigned until lock-in.
    fireEvent.click(screen.getByRole('button', { name: /draft slot 3/i }))
    expect(useAppStore.getState().slotAssignments).toHaveLength(0)
    expect(screen.getByRole('button', { name: /next pick/i })).toBeDisabled()

    // Changing the tentative choice is allowed.
    fireEvent.click(screen.getByRole('button', { name: /draft slot 2/i }))
    fireEvent.click(screen.getByRole('button', { name: /lock in slot 2/i }))

    expect(useAppStore.getState().slotAssignments).toEqual([
      { teamId: useAppStore.getState().result?.pickOrder[0], slot: 2 },
    ])
    expect(screen.getByRole('button', { name: /next pick/i })).toBeEnabled()
  })

  test('undo clears a tentative slot choice', async () => {
    setupLottery('winnerChoosesSlot')
    render(<EventScreen />)

    await revealOnePick()
    fireEvent.click(screen.getByRole('button', { name: /draft slot 3/i }))
    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }))

    // Tentative choice cleared; lock-in requires picking again.
    expect(screen.getByRole('button', { name: /pick a slot/i })).toBeDisabled()
    expect(useAppStore.getState().slotAssignments).toHaveLength(0)
    // The reveal itself is untouched.
    expect(useAppStore.getState().revealCursor).toBe(1)
  })

  test('undo unlocks the last locked slot but never hides the reveal', async () => {
    setupLottery('winnerChoosesSlot')
    render(<EventScreen />)

    await revealOnePick()
    fireEvent.click(screen.getByRole('button', { name: /draft slot 3/i }))
    fireEvent.click(screen.getByRole('button', { name: /lock in slot 3/i }))
    expect(useAppStore.getState().slotAssignments).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }))

    const state = useAppStore.getState()
    expect(state.slotAssignments).toHaveLength(0)
    expect(state.revealCursor).toBe(1) // reveal stays
    // The slot picker is back for the same winner.
    expect(screen.getByRole('button', { name: /draft slot 3/i })).toBeEnabled()
  })

  test('completing all picks and slots offers the results button', async () => {
    setupLottery('winnerChoosesSlot')
    render(<EventScreen />)

    for (const slot of [2, 1, 3]) {
      await revealOnePick()
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`draft slot ${slot}$`, 'i') }))
      fireEvent.click(screen.getByRole('button', { name: /lock in slot/i }))
    }

    fireEvent.click(screen.getByRole('button', { name: /see the final draft order/i }))
    expect(useAppStore.getState().phase).toBe('results')
  })

  test('recovers gracefully with no lottery', () => {
    render(<EventScreen />)
    expect(screen.getByText(/no lottery in progress/i)).toBeInTheDocument()
  })
})
