/**
 * Active members: the managers with a team in the league's current season.
 * Pages can hide everyone else ("active members only"); rankings and grades
 * are still computed against the whole league, only the rows are hidden.
 */
import type { LeagueHistory } from './history.ts'

export function activeOwnerIds(history: LeagueHistory): Set<string> {
  const current =
    history.seasons.find((s) => s.leagueId === history.current.league_id) ?? history.seasons[0]
  const ids = new Set<string>()
  for (const t of current?.teams ?? []) if (t.ownerId) ids.add(t.ownerId)
  return ids
}
