import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeagueReviewScreen from './LeagueReviewScreen.tsx'
import { useAppStore } from '../state/store.ts'
import type { League } from '../data/types.ts'

function makeLeague(): League {
  return {
    source: 'manual',
    name: 'Test League',
    teams: [
      {
        id: 'a',
        ownerName: 'Alice',
        teamName: 'Team Alice',
        wins: 3,
        losses: 11,
        ties: 0,
        pointsFor: 1100,
        avatarUrl: null,
        playoffFinish: null,
      },
      {
        id: 'b',
        ownerName: 'Bob',
        teamName: 'Team Bob',
        wins: 10,
        losses: 4,
        ties: 0,
        pointsFor: 1500,
        avatarUrl: null,
        playoffFinish: null,
      },
    ],
  }
}

beforeEach(() => {
  localStorage.clear()
  useAppStore.getState().startOver()
})

describe('LeagueReviewScreen', () => {
  test('renders every team row', () => {
    useAppStore.getState().setLeague(makeLeague())
    render(<LeagueReviewScreen />)
    expect(screen.getByDisplayValue('Team Alice')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Team Bob')).toBeInTheDocument()
  })

  test('editing a team name updates the store', async () => {
    useAppStore.getState().setLeague(makeLeague())
    const user = userEvent.setup()
    render(<LeagueReviewScreen />)

    const input = screen.getByLabelText(/team name for alice/i)
    await user.clear(input)
    await user.type(input, 'The Juggernauts')

    const team = useAppStore.getState().league?.teams.find((t) => t.id === 'a')
    expect(team?.teamName).toBe('The Juggernauts')
  })

  test('editing wins coerces invalid input to zero', async () => {
    useAppStore.getState().setLeague(makeLeague())
    const user = userEvent.setup()
    render(<LeagueReviewScreen />)

    const winsInput = screen.getByLabelText(/wins for team alice/i)
    await user.clear(winsInput)
    await user.type(winsInput, 'abc')

    expect(useAppStore.getState().league?.teams.find((t) => t.id === 'a')?.wins).toBe(0)
  })

  test('continue advances to the config phase', async () => {
    useAppStore.getState().setLeague(makeLeague())
    const user = userEvent.setup()
    render(<LeagueReviewScreen />)

    await user.click(screen.getByRole('button', { name: /continue to lottery settings/i }))
    expect(useAppStore.getState().phase).toBe('config')
  })

  test('recovers gracefully with no league', () => {
    render(<LeagueReviewScreen />)
    expect(screen.getByText(/no league loaded/i)).toBeInTheDocument()
  })
})
