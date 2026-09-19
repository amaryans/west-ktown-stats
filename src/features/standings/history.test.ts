import { loadHistory, loadSeason } from './history.ts'
import type { SleeperClient } from '../../lib/sleeper/client.ts'
import type { SleeperLeague, SleeperRoster, SleeperUser } from '../../lib/sleeper/types.ts'

// A season the commissioner added to Sleeper from another platform: rosters
// carry the season totals, but there are no matchups, no bracket, no draft.
const league2019: SleeperLeague = {
  league_id: 'L2019',
  name: 'West K-Town',
  season: '2019',
  status: 'complete',
  previous_league_id: null,
  total_rosters: 3,
  settings: { playoff_week_start: 14 },
}
const league2020: SleeperLeague = {
  ...league2019,
  league_id: 'L2020',
  season: '2020',
  previous_league_id: 'L2019',
  metadata: { latest_league_winner_roster_id: '2' },
}
const users: SleeperUser[] = [
  { user_id: 'u1', display_name: 'Austin', metadata: { team_name: 'Old Guard' } },
  { user_id: 'u2', display_name: 'Marcus', metadata: { team_name: 'Long Gone' } },
  { user_id: 'u3', display_name: 'Dre' },
]
const rosters: SleeperRoster[] = [
  {
    roster_id: 1,
    owner_id: 'u1',
    settings: { wins: 9, losses: 4, ties: 0, fpts: 1500, fpts_decimal: 50, fpts_against: 1400 },
  },
  {
    roster_id: 2,
    owner_id: 'u2',
    settings: { wins: 10, losses: 3, ties: 0, fpts: 1450, fpts_against: 1380 },
  },
  { roster_id: 3, owner_id: 'u3', settings: { wins: 4, losses: 9, ties: 0, fpts: 1200 } },
]

function fakeClient(matchups: (leagueId: string, week: number) => unknown[] = () => []) {
  const leagues: Record<string, SleeperLeague> = { L2019: league2019, L2020: league2020 }
  return {
    getLeague: async (id: string) => {
      const l = leagues[id]
      if (!l) throw new Error('not found')
      return l
    },
    getRosters: async () => rosters,
    getUsers: async () => users,
    getMatchups: async (id: string, week: number) => matchups(id, week),
    getWinnersBracket: async () => {
      throw new Error('no bracket')
    },
    getState: async () => ({
      season: '2026',
      league_season: '2026',
      season_type: 'regular',
      week: 3,
    }),
  } as unknown as SleeperClient
}

beforeEach(() => localStorage.clear())

test('a completed season with no matchups uses the roster records Sleeper stores', async () => {
  const season = await loadSeason(fakeClient(), league2019, null, () => undefined)
  expect(season.source).toBe('sleeper-summary')
  expect(season.weeksPlayed).toEqual([])
  expect(season.complete).toBe(true)
  const marcus = season.teams.find((t) => t.ownerId === 'u2')!
  expect(marcus.h2h).toEqual({ wins: 10, losses: 3, ties: 0 })
  expect(marcus.median).toEqual({ wins: 0, losses: 0, ties: 0 })
  expect(marcus.teamName).toBe('Long Gone')
  const austin = season.teams.find((t) => t.ownerId === 'u1')!
  expect(austin.pointsFor).toBe(1500.5)
  expect(austin.pointsAgainst).toBe(1400)
})

test('a season with matchups keeps the weekly computation', async () => {
  const client = fakeClient((_id, week) =>
    week === 1
      ? [
          { roster_id: 1, matchup_id: 1, points: 100 },
          { roster_id: 2, matchup_id: 1, points: 90 },
          { roster_id: 3, matchup_id: null, points: 80 },
        ]
      : [],
  )
  const season = await loadSeason(client, league2019, null, () => undefined)
  expect(season.source).toBe('sleeper')
  expect(season.weeksPlayed).toEqual([1])
  expect(season.teams.find((t) => t.rosterId === 1)!.h2h).toEqual({
    wins: 1,
    losses: 0,
    ties: 0,
  })
})

test('the following league names the champion when the bracket gives nothing', async () => {
  const history = await loadHistory('L2020', () => undefined, fakeClient())
  expect(history.seasons.map((s) => s.season)).toEqual(['2020', '2019'])
  const s2019 = history.seasons[1]!
  expect(s2019.champion).toBe(2)
  expect(s2019.placements).toEqual({ 2: 1 })
  expect(history.seasons[0]!.champion).toBeNull()
})
