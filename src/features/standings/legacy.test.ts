import type { LegacySeason } from '../../lib/db.ts'
import type { LeagueHistory, SeasonStandings } from './history.ts'
import { careers } from './alltime.ts'
import {
  knownManagers,
  legacyOwnerId,
  legacyRanked,
  legacySeasonStandings,
  withLegacySeasons,
} from './legacy.ts'

const legacy2019: LegacySeason = {
  id: 'l1',
  season: 2019,
  source: 'ESPN',
  notes: null,
  teams: [
    {
      teamName: 'Old Guard',
      ownerName: 'Austin',
      sleeperUserId: 'u1',
      wins: 9,
      losses: 4,
      ties: 0,
      pointsFor: 1500.5,
      pointsAgainst: 1400,
      playoffFinish: 2,
    },
    {
      teamName: 'Long Gone',
      ownerName: 'Marcus',
      sleeperUserId: null,
      wins: 10,
      losses: 3,
      ties: 0,
      pointsFor: 1450,
      pointsAgainst: 1380,
      playoffFinish: 1,
    },
    {
      teamName: '',
      ownerName: 'Dre',
      sleeperUserId: 'u4',
      wins: 4,
      losses: 9,
      ties: 0,
      pointsFor: 1200,
      pointsAgainst: 1520,
      playoffFinish: null,
    },
  ],
  updated_by: null,
  updated_at: '2026-09-19T00:00:00Z',
}

const sleeper2024: SeasonStandings = {
  leagueId: '100',
  season: '2024',
  name: 'West K-Town',
  status: 'complete',
  medianEnabled: true,
  playoffWeekStart: 15,
  weeksPlayed: [1, 2],
  champion: 1,
  placements: { 1: 1 },
  teams: [
    {
      rosterId: 1,
      ownerId: 'u1',
      ownerName: 'Austin',
      teamName: 'Gridiron Gang',
      avatar: null,
      teamAvatarUrl: null,
      h2h: { wins: 2, losses: 0, ties: 0 },
      median: { wins: 1, losses: 1, ties: 0 },
      combined: { wins: 3, losses: 1, ties: 0 },
      pointsFor: 250,
      pointsAgainst: 200,
      weekly: [{ week: 1, points: 120, opponentRosterId: 2, opponentPoints: 100 }],
    },
  ],
  complete: true,
}
const history: LeagueHistory = {
  current: {
    league_id: '100',
    name: 'West K-Town',
    season: '2024',
    status: 'complete',
    previous_league_id: null,
    total_rosters: 12,
  },
  seasons: [sleeper2024],
}

test('a hand-entered season takes the shape of a Sleeper season, without weekly data', () => {
  const s = legacySeasonStandings(legacy2019)
  expect(s.leagueId).toBe('legacy:2019')
  expect(s.season).toBe('2019')
  expect(s.source).toBe('manual')
  expect(s.sourceName).toBe('ESPN')
  expect(s.complete).toBe(true)
  expect(s.medianEnabled).toBe(false)
  expect(s.weeksPlayed).toEqual([])
  expect(s.champion).toBe(2)
  expect(s.placements).toEqual({ 1: 2, 2: 1 })
  expect(s.teams.map((t) => t.ownerId)).toEqual(['u1', legacyOwnerId('Marcus'), 'u4'])
  expect(s.teams[2]?.teamName).toBe('Dre') // no team name: the manager's name stands in
  expect(s.teams[0]?.h2h).toEqual({ wins: 9, losses: 4, ties: 0 })
  expect(s.teams[0]?.median).toEqual({ wins: 0, losses: 0, ties: 0 })
  expect(s.teams[0]?.weekly).toEqual([])
})

test('legacyRanked orders by record then points', () => {
  expect(legacyRanked(legacy2019).map((t) => t.teamName)).toEqual(['Long Gone', 'Old Guard', 'Dre'])
})

test('withLegacySeasons merges newest first and lets Sleeper win a shared year', () => {
  const dup: LegacySeason = { ...legacy2019, id: 'l2', season: 2024 }
  const merged = withLegacySeasons(history, [dup, legacy2019])
  expect(merged.seasons.map((s) => s.season)).toEqual(['2024', '2019'])
  expect(merged.seasons[0]).toBe(sleeper2024)
  expect(withLegacySeasons(history, [])).toBe(history)
})

test('careers span Sleeper and hand-entered seasons, keyed by manager', () => {
  const rows = careers(withLegacySeasons(history, [legacy2019]))
  const austin = rows.find((c) => c.ownerId === 'u1')!
  expect(austin.seasonsPlayed).toBe(2)
  expect(austin.h2h).toEqual({ wins: 11, losses: 4, ties: 0 })
  expect(austin.median).toEqual({ wins: 1, losses: 1, ties: 0 })
  expect(austin.playoffAppearances).toBe(2)
  expect(austin.championships).toBe(1)
  expect(austin.highestWeek?.points).toBe(120)
  const marcus = rows.find((c) => c.ownerId === legacyOwnerId('Marcus'))!
  expect(marcus.championships).toBe(1)
  expect(marcus.highestWeek).toBeNull()
})

test('knownManagers lists everyone once, Sleeper accounts flagged', () => {
  const managers = knownManagers(withLegacySeasons(history, [legacy2019]))
  expect(managers.map((m) => `${m.ownerName}:${m.sleeper}`)).toEqual([
    'Austin:true',
    'Dre:true',
    'Marcus:false',
  ])
  expect(knownManagers(null)).toEqual([])
})
