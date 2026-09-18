import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfigScreen from './ConfigScreen.tsx'
import { useAppStore } from '../state/store.ts'
import { oddsForLeagueSize } from '../engine/odds.ts'
import type { League, Team } from '../data/types.ts'

function makeTeam(id: string, wins: number, playoffFinish: number | null = null): Team {
  return {
    id,
    ownerName: `owner-${id}`,
    teamName: `team-${id}`,
    wins,
    losses: 14 - wins,
    ties: 0,
    pointsFor: 1000 + wins,
    avatarUrl: null,
    playoffFinish,
  }
}

function makeLeague(withPlayoffs: boolean): League {
  return {
    source: 'manual',
    name: 'Config Test League',
    teams: [
      makeTeam('worst', 2),
      makeTeam('mid', 7, withPlayoffs ? 2 : null),
      makeTeam('best', 12, withPlayoffs ? 1 : null),
    ],
  }
}

beforeEach(() => {
  localStorage.clear()
  useAppStore.getState().startOver()
})

describe('ConfigScreen', () => {
  test('displays odds that match oddsForLeagueSize exactly', () => {
    useAppStore.getState().setLeague(makeLeague(false))
    render(<ConfigScreen />)
    const expected = oddsForLeagueSize(3).map((bps) => `${(bps / 100).toFixed(1)}%`)
    for (const percentage of new Set(expected)) {
      const occurrences = expected.filter((p) => p === percentage).length
      expect(screen.getAllByText(percentage)).toHaveLength(occurrences)
    }
  })

  test('regular season ordering puts the worst team at seed 1', () => {
    useAppStore.getState().setLeague(makeLeague(false))
    render(<ConfigScreen />)
    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0]).toHaveTextContent('team-worst')
    expect(rows[2]).toHaveTextContent('team-best')
  })

  test('playoff option is disabled without playoff results', () => {
    useAppStore.getState().setLeague(makeLeague(false))
    render(<ConfigScreen />)
    expect(screen.getByRole('radio', { name: /playoff results/i })).toBeDisabled()
  })

  test('toggling to playoff ordering seeds the champion last', async () => {
    useAppStore.getState().setLeague(makeLeague(true))
    const user = userEvent.setup()
    render(<ConfigScreen />)

    await user.click(screen.getByRole('radio', { name: /playoff results/i }))

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('team-worst') // missed playoffs -> seed 1
    expect(rows[2]).toHaveTextContent('team-best') // champion -> last seed
    expect(useAppStore.getState().settings.orderingSource).toBe('playoffs')
  })

  test('advanced settings: setting a pick floor updates the store', async () => {
    useAppStore.getState().setLeague(makeLeague(false))
    const user = userEvent.setup()
    render(<ConfigScreen />)

    await user.click(screen.getByRole('button', { name: /advanced settings/i }))
    await user.selectOptions(screen.getByLabelText(/pick floor for team-worst/i), '2')

    expect(useAppStore.getState().settings.pickFloors).toEqual([2, null, null])
  })

  test('advanced settings: unbalanced odds block start until normalized', async () => {
    useAppStore.getState().setLeague(makeLeague(false))
    const user = userEvent.setup()
    render(<ConfigScreen />)

    await user.click(screen.getByRole('button', { name: /advanced settings/i }))
    const oddsInput = screen.getByLabelText(/odds percent for team-worst/i)
    await user.clear(oddsInput)
    await user.type(oddsInput, '50')

    expect(screen.getByRole('button', { name: /start the lottery/i })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/add up to 100%/i)

    await user.click(screen.getByRole('button', { name: /normalize to 100%/i }))

    const odds = useAppStore.getState().settings.customOddsBps
    expect(odds?.reduce((sum, bps) => sum + bps, 0)).toBe(10000)
    expect(screen.getByRole('button', { name: /start the lottery/i })).toBeEnabled()
  })

  test('advanced settings: infeasible floors block start', async () => {
    useAppStore.getState().setLeague(makeLeague(false))
    const user = userEvent.setup()
    render(<ConfigScreen />)

    await user.click(screen.getByRole('button', { name: /advanced settings/i }))
    await user.selectOptions(screen.getByLabelText(/pick floor for team-worst/i), '1')
    await user.selectOptions(screen.getByLabelText(/pick floor for team-mid/i), '1')

    expect(screen.getByRole('button', { name: /start the lottery/i })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/top-1/i)
  })

  test('start lottery runs the draw and enters the event phase', async () => {
    useAppStore.getState().setLeague(makeLeague(false))
    const user = userEvent.setup()
    render(<ConfigScreen />)

    await user.click(screen.getByRole('button', { name: /start the lottery/i }))

    const state = useAppStore.getState()
    expect(state.phase).toBe('event')
    expect(state.result?.pickOrder).toHaveLength(3)
  })
})
