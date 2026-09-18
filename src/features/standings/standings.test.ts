import * as S from './standings.ts'
import type { SleeperMatchup, SleeperRoster, SleeperUser } from '../../lib/sleeper/types.ts'

// Four teams, two weeks. Week 3 is "unplayed" (all zeros) and must be ignored.
const rosters: SleeperRoster[] = [1, 2, 3, 4].map((id) => ({ roster_id: id, owner_id: `u${id}` }))
const users: SleeperUser[] = [
  { user_id: 'u1', display_name: 'Alice', metadata: { team_name: 'Alpha' } },
  { user_id: 'u2', display_name: 'Bob', metadata: {} },
  { user_id: 'u3', display_name: 'Cara', metadata: { team_name: 'Gamma' } },
  { user_id: 'u4', display_name: 'Dan', metadata: { team_name: 'Delta' } },
]
const matchupsByWeek: Record<number, SleeperMatchup[]> = {
  1: [
    { roster_id: 1, matchup_id: 1, points: 120 },
    { roster_id: 2, matchup_id: 1, points: 100 },
    { roster_id: 3, matchup_id: 2, points: 90 },
    { roster_id: 4, matchup_id: 2, points: 110 },
  ],
  2: [
    { roster_id: 1, matchup_id: 1, points: 80 },
    { roster_id: 3, matchup_id: 1, points: 95 },
    { roster_id: 2, matchup_id: 2, points: 105 },
    { roster_id: 4, matchup_id: 2, points: 105 },
  ],
  3: [
    { roster_id: 1, matchup_id: 1, points: 0 },
    { roster_id: 2, matchup_id: 1, points: 0 },
    { roster_id: 3, matchup_id: 2, points: 0 },
    { roster_id: 4, matchup_id: 2, points: 0 },
  ],
}

test('median', () => {
  expect(S.median([1, 2, 3, 4])).toBe(2.5)
  expect(S.median([3, 1, 2])).toBe(2)
  expect(S.median([])).toBeNull()
})

test('computeSeason: h2h, median, points, unplayed weeks', () => {
  const { teams, weeksPlayed } = S.computeSeason({ rosters, users, matchupsByWeek })
  expect(weeksPlayed).toEqual([1, 2])
  const byId = Object.fromEntries(teams.map((t) => [t.rosterId, t]))

  // Week 1 median = (100+110)/2 = 105; week 2 median = (95+105)/2 = 100
  expect(byId[1]?.h2h).toEqual({ wins: 1, losses: 1, ties: 0 })
  expect(byId[1]?.median).toEqual({ wins: 1, losses: 1, ties: 0 })
  expect(byId[1]?.pointsFor).toBe(200)
  expect(byId[1]?.pointsAgainst).toBe(195)

  expect(byId[2]?.h2h).toEqual({ wins: 0, losses: 1, ties: 1 })
  expect(byId[2]?.median).toEqual({ wins: 1, losses: 1, ties: 0 })
  expect(byId[2]?.combined).toEqual({ wins: 1, losses: 2, ties: 1 })
  expect(byId[2]?.teamName).toBe('Bob') // falls back to display name

  expect(byId[3]?.h2h).toEqual({ wins: 1, losses: 1, ties: 0 })
  expect(byId[3]?.median).toEqual({ wins: 0, losses: 2, ties: 0 })

  expect(byId[4]?.h2h).toEqual({ wins: 1, losses: 0, ties: 1 })
  expect(byId[4]?.median).toEqual({ wins: 2, losses: 0, ties: 0 })
  expect(byId[4]?.combined).toEqual({ wins: 3, losses: 0, ties: 1 })
})

test('median tie: score exactly on the median counts as a tie', () => {
  const r = S.computeSeason({
    rosters: rosters.slice(0, 3),
    users,
    matchupsByWeek: {
      1: [
        { roster_id: 1, matchup_id: 1, points: 50 },
        { roster_id: 2, matchup_id: 1, points: 60 },
        { roster_id: 3, matchup_id: null, points: 70 },
      ],
    },
  })
  const byId = Object.fromEntries(r.teams.map((t) => [t.rosterId, t]))
  expect(byId[2]?.median).toEqual({ wins: 0, losses: 0, ties: 1 })
  expect(byId[3]?.h2h).toEqual({ wins: 0, losses: 0, ties: 0 }) // bye
  expect(byId[3]?.pointsFor).toBe(70)
})

test('rank: by win pct, then points for; combined mode changes order', () => {
  const { teams } = S.computeSeason({ rosters, users, matchupsByWeek })
  const h2h = S.rank(teams, 'h2h').map((t) => t.rosterId)
  const combined = S.rank(teams, 'combined').map((t) => t.rosterId)
  // h2h: team4 .750, team1 .500 (200 PF), team3 .500 (185 PF), team2 .250
  expect(h2h).toEqual([4, 1, 3, 2])
  // combined: team4 3-0-1, team1 2-2, team2 1-2-1 (.375), team3 1-3 (.250)
  expect(combined).toEqual([4, 1, 2, 3])
  expect(S.rank(teams, 'h2h')[0]?.rank).toBe(1)
})

test('formatRecord', () => {
  expect(S.formatRecord({ wins: 9, losses: 5, ties: 0 })).toBe('9-5')
  expect(S.formatRecord({ wins: 9, losses: 4, ties: 1 })).toBe('9-4-1')
})

test('regularSeasonWeeks', () => {
  const league = { season: '2023', settings: { playoff_week_start: 15 } }
  expect(
    S.regularSeasonWeeks(league, { season: '2025', season_type: 'regular', week: 3 }),
  ).toHaveLength(14)
  // Current season, week 3 in progress: fetch weeks 1..3 (week 3 dropped later if unplayed)
  expect(S.regularSeasonWeeks(league, { season: '2023', season_type: 'regular', week: 3 })).toEqual(
    [1, 2, 3],
  )
  // Current season, postseason: everything
  expect(
    S.regularSeasonWeeks(league, { season: '2023', season_type: 'post', week: 19 }),
  ).toHaveLength(14)
  // Preseason of current season: nothing
  expect(S.regularSeasonWeeks(league, { season: '2023', season_type: 'pre', week: 1 })).toEqual([])
  // No playoffs configured
  expect(S.regularSeasonWeeks({ season: '2019', settings: {} }, null)).toHaveLength(17)
  expect(
    S.regularSeasonWeeks({ season: '2022', settings: { playoff_week_start: 0 } }, null),
  ).toHaveLength(18)
})
