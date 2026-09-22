/**
 * Typed client for the public, read-only Sleeper API (https://docs.sleeper.com).
 * No auth, no API key, CORS-open. Every feature in the app talks to Sleeper
 * through this one module so the request shape and error handling stay uniform.
 */
import type {
  SleeperBracketMatchup,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayer,
  SleeperProjection,
  SleeperRoster,
  SleeperState,
  SleeperTransaction,
  SleeperUser,
} from './types.ts'

export type * from './types.ts'

export const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1'
const CDN_AVATAR_BASE = 'https://sleepercdn.com/avatars/thumbs'

export class SleeperApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly url: string,
  ) {
    super(message)
    this.name = 'SleeperApiError'
  }

  get isNotFound(): boolean {
    return this.status === 404 || this.status === 200
  }
}

export interface SleeperClientOptions {
  baseUrl?: string
  fetchFn?: typeof fetch
}

export interface SleeperClient {
  getLeague(leagueId: string): Promise<SleeperLeague>
  getRosters(leagueId: string): Promise<SleeperRoster[]>
  getUsers(leagueId: string): Promise<SleeperUser[]>
  getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]>
  getWinnersBracket(leagueId: string): Promise<SleeperBracketMatchup[]>
  getDrafts(leagueId: string): Promise<SleeperDraft[]>
  getDraftPicks(draftId: string): Promise<SleeperDraftPick[]>
  getTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]>
  getUser(usernameOrId: string): Promise<SleeperUser>
  getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]>
  getState(): Promise<SleeperState>
  /** ~5 MB. Call sparingly and cache; see lib/players.ts. */
  getPlayers(): Promise<Record<string, SleeperPlayer>>
  /**
   * Weekly projections for every player (undocumented endpoint, the one the
   * Sleeper app itself reads). Normalised to one entry per player id whatever
   * shape Sleeper answers with.
   */
  getProjections(season: string, week: number): Promise<SleeperProjection[]>
}

export function createSleeperClient(options: SleeperClientOptions = {}): SleeperClient {
  const baseUrl = options.baseUrl ?? SLEEPER_BASE_URL
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))

  async function get<T>(path: string): Promise<T> {
    const url = `${baseUrl}${path}`
    let response: Response
    try {
      response = await fetchFn(url, { headers: { Accept: 'application/json' } })
    } catch (cause) {
      throw new SleeperApiError(
        `Could not reach Sleeper (${String(cause)}) — check your connection`,
        undefined,
        url,
      )
    }
    if (!response.ok) {
      throw new SleeperApiError(
        response.status === 404
          ? `Sleeper has nothing at ${path} — check the ID`
          : `Sleeper returned HTTP ${response.status} for ${path}`,
        response.status,
        url,
      )
    }
    const body = (await response.json()) as T | null
    // Sleeper returns a 200 with a literal null body for unknown IDs.
    if (body === null) {
      throw new SleeperApiError(`Sleeper returned no data for ${path} — check the ID`, 200, url)
    }
    return body
  }

  async function getProjections(season: string, week: number): Promise<SleeperProjection[]> {
    const yr = encodeURIComponent(season)
    // The versioned path answers with a map keyed by player id; the app's own
    // path answers with an array of { player_id, stats } rows. Try both.
    try {
      const body = await get<unknown>(`/projections/nfl/regular/${yr}/${week}`)
      const rows = normaliseProjections(body)
      if (rows.length > 0) return rows
    } catch (error) {
      if (!(error instanceof SleeperApiError)) throw error
    }
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => `position[]=${p}`).join('&')
    const alt = `${baseUrl.replace(/\/v1$/, '')}/projections/nfl/${yr}/${week}?season_type=regular&${positions}&order_by=pts_ppr`
    const response = await fetchFn(alt, { headers: { Accept: 'application/json' } })
    if (!response.ok) {
      throw new SleeperApiError(
        `Sleeper returned HTTP ${response.status} for projections week ${week}`,
        response.status,
        alt,
      )
    }
    return normaliseProjections((await response.json()) as unknown)
  }

  return {
    getProjections,
    getLeague: (leagueId) => get(`/league/${encodeURIComponent(leagueId)}`),
    getRosters: (leagueId) => get(`/league/${encodeURIComponent(leagueId)}/rosters`),
    getUsers: (leagueId) => get(`/league/${encodeURIComponent(leagueId)}/users`),
    getMatchups: (leagueId, week) =>
      get(`/league/${encodeURIComponent(leagueId)}/matchups/${week}`),
    getWinnersBracket: (leagueId) => get(`/league/${encodeURIComponent(leagueId)}/winners_bracket`),
    getDrafts: (leagueId) => get(`/league/${encodeURIComponent(leagueId)}/drafts`),
    getDraftPicks: (draftId) => get(`/draft/${encodeURIComponent(draftId)}/picks`),
    getTransactions: (leagueId, week) =>
      get(`/league/${encodeURIComponent(leagueId)}/transactions/${week}`),
    getUser: (usernameOrId) => get(`/user/${encodeURIComponent(usernameOrId)}`),
    getUserLeagues: (userId, season) =>
      get(`/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`),
    getState: () => get('/state/nfl'),
    getPlayers: () => get('/players/nfl'),
  }
}

/**
 * Accepts either projections shape — `{ [player_id]: stats }` or
 * `[{ player_id, stats }]` — and returns one row per player.
 */
export function normaliseProjections(body: unknown): SleeperProjection[] {
  if (Array.isArray(body)) {
    return body.flatMap((row: unknown) => {
      if (!row || typeof row !== 'object') return []
      const r = row as Record<string, unknown>
      const id = r.player_id
      const stats = r.stats
      if ((typeof id !== 'string' && typeof id !== 'number') || !stats || typeof stats !== 'object')
        return []
      return [
        {
          player_id: String(id),
          stats: stats as SleeperProjection['stats'],
          week: typeof r.week === 'number' ? r.week : null,
          season: typeof r.season === 'string' ? r.season : null,
          team: typeof r.team === 'string' ? r.team : null,
          opponent: typeof r.opponent === 'string' ? r.opponent : null,
        },
      ]
    })
  }
  if (body && typeof body === 'object') {
    return Object.entries(body as Record<string, unknown>).flatMap(([id, stats]) =>
      stats && typeof stats === 'object'
        ? [{ player_id: id, stats: stats as SleeperProjection['stats'] }]
        : [],
    )
  }
  return []
}

/** The app-wide client. Tests build their own with a fake fetchFn. */
export const sleeper: SleeperClient = createSleeperClient()

/** Build a CDN URL from a Sleeper avatar id. */
export function sleeperAvatarUrl(avatarId: string): string {
  return `${CDN_AVATAR_BASE}/${avatarId}`
}

/** Best avatar for a user: custom team avatar URL, else their Sleeper avatar, else null. */
export function userAvatarUrl(user: SleeperUser | undefined | null): string | null {
  const custom = user?.metadata?.avatar
  if (custom) return custom
  if (user?.avatar) return sleeperAvatarUrl(user.avatar)
  return null
}

export function isValidLeagueId(value: string): boolean {
  return /^\d{5,}$/.test(value.trim())
}

/** Run tasks with limited concurrency, preserving order of results. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i] as T, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
