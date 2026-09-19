import { fetchManualHistory, mapManualHistory, mapStandingRow } from './manualHistory.ts'

test('mapStandingRow reads the likely field names and a record string', () => {
  const { team, missing } = mapStandingRow(
    {
      team_name: 'Old Guard',
      owner: { display_name: 'Austin' },
      record: '9-4-1',
      points_for: '1,500.5',
      pa: 1400,
      rank: '2',
    },
    0,
  )
  expect(team).toEqual({
    teamName: 'Old Guard',
    ownerName: 'Austin',
    sleeperUserId: null,
    wins: 9,
    losses: 4,
    ties: 1,
    pointsFor: 1500.5,
    pointsAgainst: 1400,
    playoffFinish: 2,
  })
  expect(missing).toEqual([])
})

test('mapStandingRow reports what it cannot find', () => {
  const { team, missing } = mapStandingRow({ something: 'else' }, 3)
  expect(team.teamName).toBe('')
  expect(missing).toEqual(['row 4: no team or manager name', 'row 4: no record'])
})

test('mapManualHistory maps each season, newest first, with finishes from top_standings', () => {
  const seasons = mapManualHistory([
    {
      season: '2018',
      import_data: { provider: 'espn' },
      league_notes: ['Ten teams'],
      season_standings: [
        { team: 'Long Gone', manager: 'Marcus', wins: 10, losses: 3, pf: 1450, pa: 1380 },
        { team: 'Old Guard', manager: 'Austin', wins: 9, losses: 4, pf: 1500, pa: 1400 },
      ],
      top_standings: { champion: 'Long Gone', runner_up: { name: 'Old Guard' } },
    },
    { season: '2019', season_standings: [] },
    { season: 'not a year', season_standings: [] },
  ])
  expect(seasons.map((s) => s.season)).toEqual([2019, 2018])
  const s2018 = seasons[1]!
  expect(s2018.source).toBe('espn')
  expect(s2018.notes).toBe('Ten teams')
  expect(s2018.teams.map((t) => [t.teamName, t.playoffFinish])).toEqual([
    ['Long Gone', 1],
    ['Old Guard', 2],
  ])
  expect(s2018.warnings).toEqual([])
  expect(seasons[0]!.source).toBe('Sleeper League History')
  expect(seasons[0]!.warnings).toEqual(['no standings rows in this season'])
})

test('fetchManualHistory sends the token and surfaces an unauthorized answer plainly', async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return new Response(
      JSON.stringify({
        data: { get_league_manual_history: null },
        errors: [{ code: 'unauthorized', message: 'Unauthorized' }],
      }),
      { status: 200 },
    )
  }
  await expect(fetchManualHistory('Bearer abc', '123', fetchFn)).rejects.toThrow(/token/)
  const headers = calls[0]!.init!.headers as Record<string, string>
  expect(headers.authorization).toBe('abc')
  expect(JSON.parse(String(calls[0]!.init!.body)).variables).toEqual({ league_id: '123' })

  const ok = async () =>
    new Response(JSON.stringify({ data: { get_league_manual_history: [{ season: '2018' }] } }), {
      status: 200,
    })
  await expect(fetchManualHistory('abc', '123', ok)).resolves.toEqual([{ season: '2018' }])
})
