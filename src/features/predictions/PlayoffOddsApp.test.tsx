import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { PredictionData } from './loader.ts'
import { forecastKey } from './engine/index.ts'

vi.mock('../../context/LeagueContext.tsx', () => ({
  errorMessage: (e: unknown) => String(e),
  useLeague: () => ({
    settings: { sleeper_league_id: 'L' },
    me: { sleeper_user_id: 'u1' },
    isCommissioner: false,
  }),
}))

const lineup = (slots: [string, string | null, number][], byes: string[] = []) => ({
  slots: slots.map(([slot, playerId, points]) => ({ slot, playerId, points })),
  bench: [],
  total: slots.reduce((s, [, , p]) => s + p, 0),
  emptySlots: slots.filter(([, id]) => id === null).length,
  byes,
})

const data: PredictionData = {
  leagueId: 'L',
  leagueName: 'Fixture',
  season: '2026',
  currentWeek: 3,
  lastRegularWeek: 4,
  playedWeeks: [1, 2],
  remainingWeeks: [3, 4],
  inProgressWeek: null,
  playoffTeams: 2,
  playoffRounds: [[5]],
  playoffWeeks: [5],
  reseed: false,
  bracket: null,
  medianGame: false,
  divisions: 0,
  rosterPositions: ['QB', 'RB', 'BN'],
  scoringKnown: true,
  teams: [
    {
      rosterId: 1,
      ownerId: 'u1',
      ownerName: 'Ann',
      teamName: 'Anns Army',
      avatarSrc: null,
      record: { wins: 2, losses: 0, ties: 0 },
      h2h: { wins: 2, losses: 0, ties: 0 },
      pointsFor: 250,
      players: ['qb1', 'rb1'],
      unavailable: [],
    },
    {
      rosterId: 2,
      ownerId: 'u2',
      ownerName: 'Ben',
      teamName: 'Bens Bunch',
      avatarSrc: null,
      record: { wins: 1, losses: 1, ties: 0 },
      h2h: { wins: 1, losses: 1, ties: 0 },
      pointsFor: 200,
      players: ['qb2', 'rb2'],
      unavailable: [],
    },
    {
      rosterId: 3,
      ownerId: 'u3',
      ownerName: 'Cy',
      teamName: 'Cy Hards',
      avatarSrc: null,
      record: { wins: 1, losses: 1, ties: 0 },
      h2h: { wins: 1, losses: 1, ties: 0 },
      pointsFor: 190,
      players: ['qb3', 'rb3'],
      unavailable: [],
    },
    {
      rosterId: 4,
      ownerId: 'u4',
      ownerName: 'Di',
      teamName: 'Di Nasty',
      avatarSrc: null,
      record: { wins: 0, losses: 2, ties: 0 },
      h2h: { wins: 0, losses: 2, ties: 0 },
      pointsFor: 150,
      players: ['qb4', 'rb4'],
      unavailable: [],
    },
  ],
  schedule: [
    { week: 3, home: 1, away: 2 },
    { week: 3, home: 3, away: 4 },
    { week: 4, home: 1, away: 3 },
    { week: 4, home: 2, away: 4 },
  ],
  forecasts: {
    [forecastKey(1, 5)]: {
      rosterId: 1,
      week: 5,
      mean: 30,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb1', 20],
        ['RB', 'rb1', 10],
      ]),
    },
    [forecastKey(2, 5)]: {
      rosterId: 2,
      week: 5,
      mean: 25,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb2', 15],
        ['RB', 'rb2', 10],
      ]),
    },
    [forecastKey(3, 5)]: {
      rosterId: 3,
      week: 5,
      mean: 22,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb3', 12],
        ['RB', 'rb3', 10],
      ]),
    },
    [forecastKey(4, 5)]: {
      rosterId: 4,
      week: 5,
      mean: 15,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb4', 10],
        ['RB', 'rb4', 5],
      ]),
    },
    [forecastKey(1, 3)]: {
      rosterId: 1,
      week: 3,
      mean: 30,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb1', 20],
        ['RB', 'rb1', 10],
      ]),
    },
    [forecastKey(2, 3)]: {
      rosterId: 2,
      week: 3,
      mean: 25,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb2', 15],
        ['RB', 'rb2', 10],
      ]),
    },
    [forecastKey(3, 3)]: {
      rosterId: 3,
      week: 3,
      mean: 20,
      sd: 10,
      lineup: lineup(
        [
          ['QB', 'qb3', 20],
          ['RB', null, 0],
        ],
        ['rb3'],
      ),
    },
    [forecastKey(4, 3)]: {
      rosterId: 4,
      week: 3,
      mean: 15,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb4', 10],
        ['RB', 'rb4', 5],
      ]),
    },
    [forecastKey(1, 4)]: {
      rosterId: 1,
      week: 4,
      mean: 30,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb1', 20],
        ['RB', 'rb1', 10],
      ]),
    },
    [forecastKey(2, 4)]: {
      rosterId: 2,
      week: 4,
      mean: 25,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb2', 15],
        ['RB', 'rb2', 10],
      ]),
    },
    [forecastKey(3, 4)]: {
      rosterId: 3,
      week: 4,
      mean: 22,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb3', 12],
        ['RB', 'rb3', 10],
      ]),
    },
    [forecastKey(4, 4)]: {
      rosterId: 4,
      week: 4,
      mean: 15,
      sd: 10,
      lineup: lineup([
        ['QB', 'qb4', 10],
        ['RB', 'rb4', 5],
      ]),
    },
  },
  players: {
    qb1: { playerId: 'qb1', name: 'QB One', positions: ['QB'], team: 'KC' },
    rb1: { playerId: 'rb1', name: 'RB One', positions: ['RB'], team: 'KC' },
    qb2: { playerId: 'qb2', name: 'QB Two', positions: ['QB'], team: 'SF' },
    rb2: { playerId: 'rb2', name: 'RB Two', positions: ['RB'], team: 'SF' },
    qb3: { playerId: 'qb3', name: 'QB Three', positions: ['QB'], team: 'BUF' },
    rb3: { playerId: 'rb3', name: 'RB Three', positions: ['RB'], team: 'DET' },
    qb4: { playerId: 'qb4', name: 'QB Four', positions: ['QB'], team: 'NYJ' },
    rb4: { playerId: 'rb4', name: 'RB Four', positions: ['RB'], team: 'NYJ' },
  },
  missingProjectionWeeks: [],
  byeTeamsByWeek: { 3: ['DET'], 4: [] },
  loadedAt: 0,
}

vi.mock('./loader.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./loader.ts')>()),
  loadPredictionData: vi.fn(async () => data),
}))

import PlayoffOddsApp from './PlayoffOddsApp.tsx'

describe('PlayoffOddsApp', () => {
  it('shows odds, the next week, and the selected lineup', async () => {
    render(
      <MemoryRouter>
        <PlayoffOddsApp />
      </MemoryRouter>,
    )
    const heading = await screen.findByRole('heading', { name: /2 weeks to play/ })
    expect(heading).toBeInTheDocument()
    expect(screen.getByText(/2 of 4 regular-season weeks final/)).toBeInTheDocument()

    // The signed-in owner's undefeated team is ranked first and highlighted.
    const odds = screen.getByRole('table', { name: 'Playoff odds' })
    const rows = within(odds).getAllByRole('row').slice(1)
    expect(within(rows[0] as HTMLElement).getByText('Anns Army')).toBeInTheDocument()
    expect(rows[0]).toHaveClass('is-me')
    const playoffCell = (rows[0] as HTMLElement).querySelector('td.col-strong') as HTMLElement
    expect(parseFloat(playoffCell.textContent ?? '0')).toBeGreaterThan(80)
    expect(within(rows[3] as HTMLElement).getByText('Di Nasty')).toBeInTheDocument()
    // Title and Final odds come from the simulated bracket; Status from the exact check.
    expect(within(odds).getByText('Title')).toBeInTheDocument()
    expect(within(odds).getByText('Final')).toBeInTheDocument()
    expect(within(odds).getByText('Opp. proj.')).toBeInTheDocument()
    // 0-2 with two weeks left and two spots: Di can still reach 2-2 and tie, so not out yet.
    expect(within(rows[3] as HTMLElement).queryByText('Out')).toBeNull()
    expect(within(rows[3] as HTMLElement).getByText(/E/)).toBeInTheDocument()
    // Ann's remaining opponents (Ben 25, Cy 22) average 23.5.
    expect(within(rows[0] as HTMLElement).getByText('23.5')).toBeInTheDocument()

    // Week 3 matchups list both games with the favourite marked.
    expect(screen.getByRole('heading', { name: 'Week 3' })).toBeInTheDocument()
    expect(screen.getAllByText('vs')).toHaveLength(2)

    // The signed-in owner's team is selected by default; the lineup shows their starters.
    const teamSelect = screen.getByRole('combobox', { name: 'Team' })
    expect(teamSelect).toHaveValue('1')
    expect(screen.getByRole('heading', { name: 'Anns Army · Week 3' })).toBeInTheDocument()
    expect(screen.getByText('QB One')).toBeInTheDocument()

    // Switching to the team with a bye shows the empty slot.
    await userEvent.selectOptions(teamSelect, '3')
    expect(screen.getByRole('heading', { name: 'Cy Hards · Week 3' })).toBeInTheDocument()
    expect(screen.getByText(/1 slot unfilled/)).toBeInTheDocument()
    expect(screen.getByText('empty')).toBeInTheDocument()
  })
})
