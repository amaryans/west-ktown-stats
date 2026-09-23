/**
 * What the execution pages need beyond `LeagueHistory`: every season's
 * player-level matchups (shared with keeper success, which already fetches
 * and caches them) and that season's lineup slots (`roster_positions`,
 * cached here for completed seasons).
 */
import { sleeper, type SleeperClient } from '../../lib/sleeper/client.ts'
import type { SleeperMatchup } from '../../lib/sleeper/types.ts'
import { loadKeeperSuccessRaw } from '../keepers/successLoader.ts'
import type { LeagueHistory } from '../standings/history.ts'

const CACHE_PREFIX = 'wkt.rosterpositions:v1:'

export interface LineupSeason {
  leagueId: string
  season: string
  complete: boolean
  rosterPositions: string[]
  matchupsByWeek: Record<number, SleeperMatchup[]>
}

async function rosterPositions(
  client: SleeperClient,
  leagueId: string,
  complete: boolean,
): Promise<string[]> {
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + leagueId)
    if (cached) return JSON.parse(cached) as string[]
  } catch {
    /* private mode: fetch */
  }
  const league = await client.getLeague(leagueId)
  const positions = league.roster_positions ?? []
  if (complete && positions.length) {
    try {
      localStorage.setItem(CACHE_PREFIX + leagueId, JSON.stringify(positions))
    } catch {
      /* quota: ignore */
    }
  }
  return positions
}

/** Every Sleeper season with weekly matchups, newest first. */
export async function loadLineupSeasons(
  history: LeagueHistory,
  onProgress: (message: string) => void = () => undefined,
  client: SleeperClient = sleeper,
): Promise<LineupSeason[]> {
  const raws = await loadKeeperSuccessRaw(history, onProgress, client)
  onProgress('Reading lineup settings…')
  const out = await Promise.all(
    raws.map(async (raw) => {
      const standings = history.seasons.find((s) => s.leagueId === raw.leagueId)
      return {
        leagueId: raw.leagueId,
        season: standings?.season ?? String(raw.season),
        complete: raw.complete,
        rosterPositions: await rosterPositions(client, raw.leagueId, raw.complete),
        matchupsByWeek: raw.matchupsByWeek,
      }
    }),
  )
  return out.filter((s) => Object.keys(s.matchupsByWeek).length > 0)
}
