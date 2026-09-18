import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LotteryApp from './LotteryApp.tsx'
import { useAppStore } from './state/store.ts'
import type { League, Team } from './data/types.ts'

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
    name: 'Nav Test League',
    teams: [makeTeam('a', 2), makeTeam('b', 7), makeTeam('c', 12)],
  }
}

beforeEach(() => {
  localStorage.clear()
  useAppStore.getState().startOver()
})

describe('LotteryApp', () => {
  test('lottery links are disabled until a league is loaded', () => {
    render(<LotteryApp />)
    expect(screen.getByRole('button', { name: /^setup$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^odds$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^simulate$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /lottery board/i })).toBeDisabled()
  })

  test('settings and simulation unlock with a league; board needs a result', async () => {
    useAppStore.getState().setLeague(makeLeague())
    const user = userEvent.setup()
    render(<LotteryApp />)

    expect(screen.getByRole('button', { name: /lottery board/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /^simulate$/i }))
    expect(useAppStore.getState().phase).toBe('simulation')

    await user.click(screen.getByRole('button', { name: /^odds$/i }))
    expect(useAppStore.getState().phase).toBe('config')

    act(() => useAppStore.getState().startLottery())
    expect(screen.getByRole('button', { name: /lottery board/i })).toBeEnabled()
  })

  test('setup returns to the setup screen', async () => {
    useAppStore.getState().setLeague(makeLeague())
    const user = userEvent.setup()
    render(<LotteryApp />)
    await user.click(screen.getByRole('button', { name: /^setup$/i }))
    expect(useAppStore.getState().phase).toBe('setup')
  })
})
