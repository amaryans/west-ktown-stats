import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResultsScreen from './ResultsScreen.tsx'
import { useAppStore } from '../state/store.ts'
import type { League, Team } from '../data/types.ts'

vi.mock('../shareImage.ts', () => ({
  downloadPoster: vi.fn().mockResolvedValue(undefined),
  copyPoster: vi.fn().mockResolvedValue(true),
  posterFilename: (name: string) => `${name}.png`,
}))
import { downloadPoster } from '../shareImage.ts'

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
    name: 'Results Test League',
    teams: [makeTeam('a', 2), makeTeam('b', 7), makeTeam('c', 12)],
  }
}

beforeEach(() => {
  localStorage.clear()
  useAppStore.getState().startOver()
  vi.clearAllMocks()
})

function completeLottery() {
  useAppStore.getState().setLeague(makeLeague())
  useAppStore.getState().updateSettings({ slotMode: 'lotteryIsOrder' })
  useAppStore.getState().startLottery()
  useAppStore.getState().finishEvent()
}

describe('ResultsScreen', () => {
  test('renders the final order matching the pick order', () => {
    completeLottery()
    render(<ResultsScreen />)

    const pickOrder = useAppStore.getState().result?.pickOrder ?? []
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    pickOrder.forEach((teamId, index) => {
      expect(items[index]).toHaveTextContent(`team-${teamId}`)
    })
  })

  test('shows the lottery seed for verifiability', () => {
    completeLottery()
    render(<ResultsScreen />)
    const seed = useAppStore.getState().result?.seedUsed as number
    expect(screen.getByText(new RegExp(`Lottery seed ${seed}`))).toBeInTheDocument()
  })

  test('download button exports the poster', async () => {
    completeLottery()
    const user = userEvent.setup()
    render(<ResultsScreen />)

    await user.click(screen.getByRole('button', { name: /download image/i }))
    expect(downloadPoster).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent(/downloaded/i)
  })

  test('run again draws a fresh lottery after confirmation', async () => {
    completeLottery()
    const firstSeed = useAppStore.getState().result?.seedUsed
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    render(<ResultsScreen />)

    await user.click(screen.getByRole('button', { name: /run again/i }))

    const state = useAppStore.getState()
    expect(state.phase).toBe('event')
    expect(state.result?.seedUsed).not.toBe(firstSeed)
  })

  test('recovers gracefully with no completed lottery', () => {
    render(<ResultsScreen />)
    expect(screen.getByText(/no completed lottery/i)).toBeInTheDocument()
  })
})
