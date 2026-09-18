import {
  isValidLeagueId,
  sleeper,
  SleeperApiError,
  sleeperAvatarUrl,
  type SleeperBracketMatchup,
  type SleeperLeague,
  type SleeperRoster,
  type SleeperUser,
} from '../../../../lib/sleeper/client.ts'

export { SleeperApiError, sleeperAvatarUrl }

/** Everything needed to import a league, fetched together. */
export interface SleeperLeagueBundle {
  league: SleeperLeague
  rosters: SleeperRoster[]
  users: SleeperUser[]
  /** Null when the bracket fetch fails or playoffs haven't happened. */
  winnersBracket: SleeperBracketMatchup[] | null
}

function validateLeagueId(leagueId: string): void {
  if (!isValidLeagueId(leagueId)) {
    throw new SleeperApiError(
      'League IDs are long numbers — find yours in the Sleeper app under League > Settings',
      404,
      '',
    )
  }
}

export function getLeague(leagueId: string): Promise<SleeperLeague> {
  validateLeagueId(leagueId)
  return sleeper.getLeague(leagueId.trim())
}

/** Fetch league, rosters, and users together; the bracket is best-effort. */
export async function getLeagueBundle(leagueId: string): Promise<SleeperLeagueBundle> {
  validateLeagueId(leagueId)
  const id = leagueId.trim()
  const [league, rosters, users] = await Promise.all([
    sleeper.getLeague(id),
    sleeper.getRosters(id),
    sleeper.getUsers(id),
  ])
  const winnersBracket = await sleeper.getWinnersBracket(id).catch(() => null)
  return { league, rosters, users, winnersBracket }
}

export function getUserByName(username: string): Promise<SleeperUser> {
  const trimmed = username.trim()
  if (trimmed.length === 0) {
    return Promise.reject(new SleeperApiError('Enter a Sleeper username', 404, ''))
  }
  return sleeper.getUser(trimmed)
}

export function getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
  return sleeper.getUserLeagues(userId, season)
}
