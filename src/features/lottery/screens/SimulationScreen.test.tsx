import { render, screen } from '@testing-library/react'
import SimulationScreen from './SimulationScreen.tsx'
import { useAppStore } from '../state/store.ts'
import type { League, Team } from '../data/types.ts'

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
    name: 'Sim Test League',
    teams: [makeTeam('a', 2), makeTeam('b', 7), makeTeam('c', 12)],
  }
}

beforeEach(() => {
  localStorage.clear()
  useAppStore.getState().startOver()
})

describe('SimulationScreen', () => {
  test('renders a distribution row per team', () => {
    useAppStore.getState().setLeague(makeLeague())
    render(<SimulationScreen />)
    expect(screen.getByText('team-a')).toBeInTheDocument()
    expect(screen.getByText('team-b')).toBeInTheDocument()
    expect(screen.getByText('team-c')).toBeInTheDocument()
    // Worst team (a) is seed 1 in the first data row.
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('team-a')
  })

  test('floored outcomes show as impossible', () => {
    useAppStore.getState().setLeague(makeLeague())
    useAppStore.getState().updateSettings({ pickFloors: [2, null, null] })
    render(<SimulationScreen />)
    // Seed 1 is guaranteed top-2, so its pick-3 cell must be a dash.
    const seedOneRow = screen.getAllByRole('row').slice(1)[0]
    const cells = seedOneRow ? Array.from(seedOneRow.querySelectorAll('td')) : []
    expect(cells[cells.length - 1]).toHaveTextContent('—')
  })

  test('recovers gracefully with no league', () => {
    render(<SimulationScreen />)
    expect(screen.getByText(/load a league/i)).toBeInTheDocument()
  })
})
