import { describe, expect, test } from 'vitest'
import {
  adpApiUrl,
  adpPageUrl,
  canonicalTeam,
  entriesFromAdp,
  formatForLeague,
  nearestTeamSize,
  seasonsToSync,
  subjectFor,
} from './adp.mjs'

// Shape of https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year=2026
const payload = {
  status: 'Success',
  meta: { type: 'PPR', teams: 12, rounds: 15, total_drafts: 812 },
  players: [
    {
      player_id: 1,
      name: "Ja'Marr Chase",
      position: 'WR',
      team: 'CIN',
      adp: 1.4,
      adp_formatted: '1.01',
      times_drafted: 800,
    },
    {
      player_id: 2,
      name: 'Bijan Robinson',
      position: 'RB',
      team: 'ATL',
      adp: 2.26,
      adp_formatted: '1.02',
      times_drafted: 790,
    },
    {
      player_id: 3,
      name: 'Philadelphia Defense',
      position: 'DEF',
      team: 'PHI',
      adp: 98.1,
      adp_formatted: '9.02',
      times_drafted: 500,
    },
    {
      player_id: 4,
      name: 'Jacksonville Defense',
      position: 'DEF',
      team: 'JAC',
      adp: 130.4,
      adp_formatted: '11.10',
      times_drafted: 300,
    },
    {
      player_id: 5,
      name: 'Bijan Robinson',
      position: 'RB',
      team: 'ATL',
      adp: 50,
      adp_formatted: '5.02',
      times_drafted: 1,
    },
    { player_id: 6, name: 'Nobody', position: 'K', team: 'SF', adp: 0 },
  ],
}

describe('entriesFromAdp', () => {
  const rows = entriesFromAdp(payload, {
    definitionId: 'def-1',
    season: 2026,
    sourceUrl: 'https://x',
  })

  test('one week-0 row per player, best pick first, tenths of a pick', () => {
    expect(rows.map((r) => r.subject)).toEqual([
      "Ja'Marr Chase",
      'Bijan Robinson',
      'Philadelphia Eagles',
      'Jacksonville Jaguars',
    ])
    expect(rows[0]).toEqual({
      definition_id: 'def-1',
      season: 2026,
      week: 0,
      subject: "Ja'Marr Chase",
      value: 1.4,
      note: 'WR · CIN · 800 drafts · round 1.01',
      source_url: 'https://x',
      entered_by: null,
    })
    expect(rows[1].value).toBe(2.3)
  })

  test('drops repeats and unusable picks', () => {
    expect(rows.filter((r) => r.subject === 'Bijan Robinson')).toHaveLength(1)
    expect(rows.find((r) => r.subject === 'Nobody')).toBeUndefined()
  })

  test('tolerates an empty or malformed feed', () => {
    expect(entriesFromAdp({}, { definitionId: 'd', season: 2026, sourceUrl: 's' })).toEqual([])
    expect(entriesFromAdp(null, { definitionId: 'd', season: 2026, sourceUrl: 's' })).toEqual([])
  })
})

test('defenses take the Sleeper spelling, other names pass through', () => {
  expect(subjectFor({ name: 'Buffalo Defense', position: 'DEF', team: 'BUF' })).toBe(
    'Buffalo Bills',
  )
  expect(subjectFor({ name: 'LA Defense', position: 'DEF', team: 'LA' })).toBe('Los Angeles Rams')
  expect(subjectFor({ name: 'Mystery Defense', position: 'DEF', team: 'XX' })).toBe(
    'Mystery Defense',
  )
  expect(subjectFor({ name: ' Amon-Ra St. Brown ', position: 'WR', team: 'DET' })).toBe(
    'Amon-Ra St. Brown',
  )
  expect(canonicalTeam('wsh')).toBe('WAS')
  expect(canonicalTeam('KC')).toBe('KC')
})

test('formatForLeague reads reception scoring and quarterback slots', () => {
  expect(formatForLeague({ scoring_settings: { rec: 1 }, roster_positions: ['QB', 'RB'] })).toBe(
    'ppr',
  )
  expect(formatForLeague({ scoring_settings: { rec: 0.5 } })).toBe('half-ppr')
  expect(formatForLeague({ scoring_settings: { rec: 0 } })).toBe('standard')
  expect(
    formatForLeague({ scoring_settings: { rec: 1 }, roster_positions: ['QB', 'SUPER_FLEX'] }),
  ).toBe('2qb')
  expect(formatForLeague(null)).toBe('standard')
})

test('nearestTeamSize snaps to a published league size', () => {
  expect(nearestTeamSize(12)).toBe(12)
  expect(nearestTeamSize(11)).toBe(10)
  expect(nearestTeamSize(16)).toBe(14)
  expect(nearestTeamSize(undefined)).toBe(12)
})

test('urls name the format, size and season', () => {
  expect(adpApiUrl('ppr', 12, 2026)).toBe(
    'https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year=2026',
  )
  expect(adpPageUrl('half-ppr', 10, 2024)).toBe(
    'https://fantasyfootballcalculator.com/adp/half-ppr/10-team/all/2024',
  )
})

describe('seasonsToSync', () => {
  test('an explicit list wins, newest first, de-duplicated', () => {
    expect(
      seasonsToSync({ explicit: '2024, 2026,2025 2024', leagueSeason: 2026, today: new Date() }),
    ).toEqual([2026, 2025, 2024])
  })
  test('defaults to the league season, adding the calendar year once mock drafts start', () => {
    expect(
      seasonsToSync({ explicit: '', leagueSeason: 2026, today: new Date('2026-09-18') }),
    ).toEqual([2026])
    expect(
      seasonsToSync({ explicit: '', leagueSeason: 2026, today: new Date('2027-06-01') }),
    ).toEqual([2027, 2026])
    expect(
      seasonsToSync({ explicit: '', leagueSeason: 2026, today: new Date('2027-02-01') }),
    ).toEqual([2026])
    expect(
      seasonsToSync({ explicit: '', leagueSeason: null, today: new Date('2027-02-01') }),
    ).toEqual([2027])
  })
})
