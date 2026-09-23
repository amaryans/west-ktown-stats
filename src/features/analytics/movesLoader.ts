/**
 * Every season's trades, waiver claims and free-agent moves, read week by
 * week from Sleeper. Completed seasons are cached in localStorage.
 */
import { mapLimit, sleeper, type SleeperClient } from '../../lib/sleeper/client.ts'
import type { SleeperTransaction } from '../../lib/sleeper/types.ts'
import type { LineupSeason } from './lineupLoader.ts'
import { normaliseMoves, type Move } from './transactions.ts'

const CACHE_PREFIX = 'wkt.moves:v1:'
const CONCURRENCY = 4

export interface SeasonMoves {
  leagueId: string
  moves: Move[]
}

function cacheGet(leagueId: string): Move[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + leagueId)
    return raw ? (JSON.parse(raw) as Move[]) : null
  } catch {
    return null
  }
}

function cacheSet(leagueId: string, moves: Move[]): void {
  try {
    localStorage.setItem(CACHE_PREFIX + leagueId, JSON.stringify(moves))
  } catch {
    /* quota or private mode: ignore */
  }
}

/** Moves for each season, through its last regular-season week with games. */
export async function loadSeasonMoves(
  seasons: readonly LineupSeason[],
  onProgress: (message: string) => void = () => undefined,
  client: SleeperClient = sleeper,
): Promise<SeasonMoves[]> {
  let done = 0
  return mapLimit([...seasons], CONCURRENCY, async (season) => {
    const cached = season.complete ? cacheGet(season.leagueId) : null
    if (cached) return { leagueId: season.leagueId, moves: cached }
    const lastWeek = Math.max(0, ...Object.keys(season.matchupsByWeek).map(Number))
    const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1)
    const perWeek = await mapLimit(weeks, CONCURRENCY, (w) =>
      client.getTransactions(season.leagueId, w).catch(() => [] as SleeperTransaction[]),
    )
    const moves = perWeek
      .flatMap((list, i) => normaliseMoves(list, i + 1))
      .sort((a, b) => a.week - b.week || a.created - b.created)
    if (season.complete) cacheSet(season.leagueId, moves)
    done += 1
    onProgress(`Read transactions for ${done} of ${seasons.length} seasons…`)
    return { leagueId: season.leagueId, moves }
  })
}
