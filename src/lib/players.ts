/**
 * The Sleeper players dump (~5 MB) names players by id. Sleeper asks for at
 * most one fetch per day, so it is cached in IndexedDB with a 24h TTL and
 * shared by every feature that needs player names (team rosters, keepers).
 */
import { cacheGet, cacheSet } from './idbCache.ts'
import { sleeper, type SleeperClient, type SleeperPlayer } from './sleeper/client.ts'

export const PLAYERS_CACHE_KEY = 'players-nfl'
export const PLAYERS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type PlayersDump = Record<string, SleeperPlayer>

let inFlight: Promise<PlayersDump> | null = null

export function loadPlayers(client: SleeperClient = sleeper): Promise<PlayersDump> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    const cached = await cacheGet<PlayersDump>(PLAYERS_CACHE_KEY, PLAYERS_CACHE_MAX_AGE_MS)
    if (cached !== undefined) return cached
    const fresh = await client.getPlayers()
    void cacheSet(PLAYERS_CACHE_KEY, fresh)
    return fresh
  })()
  inFlight.catch(() => {
    inFlight = null
  })
  return inFlight
}

export function playerName(player: SleeperPlayer | undefined, fallback: string): string {
  if (!player) return fallback
  const name = player.full_name ?? [player.first_name, player.last_name].filter(Boolean).join(' ')
  return name || fallback
}
