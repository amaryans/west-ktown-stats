import type { League, Team } from '../types.ts'
import { sleeperAvatarUrl, type SleeperLeagueBundle } from './client.ts'
import type {
  SleeperBracketMatchup,
  SleeperRoster,
  SleeperUser,
} from '../../../../lib/sleeper/types.ts'

/** Convert a fetched Sleeper bundle into the app's League domain model. */
export function mapSleeperLeague(bundle: SleeperLeagueBundle): League {
  const { league, rosters, users, winnersBracket } = bundle
  if (rosters.length === 0) {
    throw new Error('This Sleeper league has no rosters')
  }
  const usersById = new Map(users.map((user) => [user.user_id, user]))
  const placements = winnersBracket ? parsePlacements(winnersBracket) : new Map<number, number>()

  return {
    source: 'sleeper',
    sleeperLeagueId: league.league_id,
    name: league.name,
    season: league.season,
    previousLeagueId: league.previous_league_id ?? undefined,
    teams: rosters.map((roster) => mapTeam(roster, usersById, placements)),
  }
}

function mapTeam(
  roster: SleeperRoster,
  usersById: ReadonlyMap<string, SleeperUser>,
  placements: ReadonlyMap<number, number>,
): Team {
  const user = roster.owner_id !== null ? usersById.get(roster.owner_id) : undefined
  const fallbackName = `Team ${roster.roster_id}`
  return {
    id: String(roster.roster_id),
    ownerName: user?.display_name ?? fallbackName,
    teamName: user?.metadata?.team_name ?? user?.display_name ?? fallbackName,
    wins: roster.settings?.wins ?? 0,
    losses: roster.settings?.losses ?? 0,
    ties: roster.settings?.ties ?? 0,
    pointsFor: (roster.settings?.fpts ?? 0) + (roster.settings?.fpts_decimal ?? 0) / 100,
    avatarUrl: resolveAvatarUrl(user),
    playoffFinish: placements.get(roster.roster_id) ?? null,
  }
}

function resolveAvatarUrl(user: SleeperUser | undefined): string | null {
  const customUrl = user?.metadata?.avatar
  if (customUrl) {
    return customUrl
  }
  if (user?.avatar) {
    return sleeperAvatarUrl(user.avatar)
  }
  return null
}

/**
 * Extract final placements from the winners bracket. Placement games carry a
 * `p` field: the winner finishes in place p, the loser in place p+1 (p=1 is
 * the championship). Teams without a placement game get no entry.
 */
export function parsePlacements(bracket: readonly SleeperBracketMatchup[]): Map<number, number> {
  const placements = new Map<number, number>()
  for (const matchup of bracket) {
    if (matchup.p === undefined) {
      continue
    }
    if (matchup.w !== null) {
      placements.set(matchup.w, matchup.p)
    }
    if (matchup.l !== null) {
      placements.set(matchup.l, matchup.p + 1)
    }
  }
  return placements
}
