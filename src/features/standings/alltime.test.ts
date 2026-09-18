import { careers, ownerSeasons } from './alltime.ts'
import type { LeagueHistory, SeasonStandings } from './history.ts'
import { computeSeason } from './standings.ts'

function season(
  year: string,
  scores: Record<number, [number, number]>,
  champion: number | null,
): SeasonStandings {
  const rosters = [1, 2].map((id) => ({ roster_id: id, owner_id: `u${id}` }))
  const users = [
    { user_id: 'u1', display_name: 'Alice', metadata: { team_name: 'Alpha' } },
    { user_id: 'u2', display_name: 'Bob', metadata: { team_name: 'Beta' } },
  ]
  const matchupsByWeek = Object.fromEntries(
    Object.entries(scores).map(([week, [a, b]]) => [
      week,
      [
        { roster_id: 1, matchup_id: 1, points: a },
        { roster_id: 2, matchup_id: 1, points: b },
      ],
    ]),
  )
  const { teams, weeksPlayed } = computeSeason({ rosters, users, matchupsByWeek })
  return {
    leagueId: `L${year}`,
    season: year,
    name: 'Test',
    status: 'complete',
    medianEnabled: false,
    playoffWeekStart: 15,
    weeksPlayed,
    champion,
    placements: champion ? { [champion]: 1, [champion === 1 ? 2 : 1]: 2 } : {},
    teams,
    complete: true,
  }
}

const history: LeagueHistory = {
  current: {
    league_id: 'L2024',
    name: 'Test',
    season: '2024',
    status: 'complete',
    avatar: null,
    previous_league_id: 'L2023',
    total_rosters: 2,
  },
  seasons: [
    season('2024', { 1: [100, 90], 2: [80, 95] }, 2),
    season('2023', { 1: [120, 90], 2: [110, 95] }, 1),
  ],
}

test('ownerSeasons groups each owner newest first with ranks', () => {
  const rows = ownerSeasons(history)
  const alice = rows.get('u1')
  expect(alice?.map((s) => s.season)).toEqual(['2024', '2023'])
  expect(alice?.[1]?.h2h).toEqual({ wins: 2, losses: 0, ties: 0 })
  expect(alice?.[1]?.rank).toBe(1)
  expect(alice?.[1]?.champion).toBe(true)
  expect(alice?.[0]?.playoffFinish).toBe(2)
})

test('careers totals records, championships and highest week', () => {
  const all = careers(history)
  expect(all.map((c) => c.ownerName)).toEqual(['Alice', 'Bob'])
  const alice = all[0]
  expect(alice?.h2h).toEqual({ wins: 3, losses: 1, ties: 0 })
  expect(alice?.championships).toBe(1)
  expect(alice?.playoffAppearances).toBe(2)
  expect(alice?.bestFinish).toBe(1)
  expect(alice?.pointsFor).toBe(410)
  expect(alice?.highestWeek).toEqual({ season: '2023', week: 1, points: 120 })
  expect(alice?.averageRank).toBe(1.5)
})
