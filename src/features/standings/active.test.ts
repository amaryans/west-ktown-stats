import { activeOwnerIds } from './active.ts'
import type { LeagueHistory, SeasonStandings } from './history.ts'

const season = (leagueId: string, owners: (string | null)[]) =>
  ({
    leagueId,
    season: leagueId,
    teams: owners.map((ownerId, i) => ({ rosterId: i + 1, ownerId })),
  }) as unknown as SeasonStandings

test('active members are the owners in the current league', () => {
  const history = {
    current: { league_id: 'L2026' },
    seasons: [season('L2026', ['a', 'b', null]), season('L2025', ['a', 'c'])],
  } as unknown as LeagueHistory
  expect([...activeOwnerIds(history)].sort()).toEqual(['a', 'b'])
})
