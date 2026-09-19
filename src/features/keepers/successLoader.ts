/**
 * Gathers what keeper success needs from Sleeper for every season in the
 * league's history: the draft (who was kept, at which pick) and each
 * regular-season week's matchups (who scored what, who started). Completed
 * seasons are cached in localStorage; the season in progress is refetched.
 */
import type { LeagueHistory, SeasonStandings } from '../standings/history.ts'
import { rank } from '../standings/standings.ts'
import { teamAvatarSrc } from '../standings/SeasonTable.tsx'
import { mapLimit, sleeper, type SleeperClient } from '../../lib/sleeper/client.ts'
import type { SleeperMatchup } from '../../lib/sleeper/types.ts'
import type { SuccessPick, SuccessTeam } from './success.ts'

const CACHE_PREFIX = 'wkt.keepersuccess:v1:'
const CONCURRENCY = 3

/** One season's raw material, independent of anything stored in the site's database. */
export interface SeasonRaw {
  season: number
  leagueId: string
  complete: boolean
  picks: SuccessPick[]
  matchupsByWeek: Record<number, SleeperMatchup[]>
  teams: SuccessTeam[]
  /** Why the draft could not be read, if it could not. */
  draftError: string | null
}

function cacheGet(leagueId: string): SeasonRaw | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + leagueId)
    return raw ? (JSON.parse(raw) as SeasonRaw) : null
  } catch {
    return null
  }
}

function cacheSet(leagueId: string, value: SeasonRaw): void {
  try {
    localStorage.setItem(CACHE_PREFIX + leagueId, JSON.stringify(value))
  } catch {
    /* quota or private mode: ignore */
  }
}

/** Only what the scoring reads, so the cache stays small. */
function compact(m: SleeperMatchup): SleeperMatchup {
  return {
    roster_id: m.roster_id,
    matchup_id: m.matchup_id,
    points: m.points,
    starters: m.starters ?? null,
    players_points: m.players_points ?? null,
  }
}

export function teamsFromStandings(season: SeasonStandings): SuccessTeam[] {
  return rank(season.teams, 'h2h').map((t) => ({
    rosterId: t.rosterId,
    ownerId: t.ownerId,
    ownerName: t.ownerName,
    teamName: t.teamName,
    avatarSrc: teamAvatarSrc(t),
    rank: t.rank,
    placement: season.placements[t.rosterId] ?? null,
    wins: t.h2h.wins,
    losses: t.h2h.losses,
    ties: t.h2h.ties,
  }))
}

async function loadDraftPicks(
  client: SleeperClient,
  leagueId: string,
): Promise<{ picks: SuccessPick[]; error: string | null }> {
  try {
    const drafts = await client.getDrafts(leagueId)
    const draft = drafts.find((d) => d.status === 'complete') ?? drafts[0]
    if (!draft) return { picks: [], error: 'No draft on Sleeper for this season.' }
    const raw = await client.getDraftPicks(draft.draft_id)
    const slotToRoster = draft.slot_to_roster_id ?? {}
    const picks: SuccessPick[] = []
    for (const p of raw) {
      if (!p.player_id) continue
      const rosterId = p.roster_id ?? slotToRoster[String(p.draft_slot)] ?? null
      const name = [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(' ')
      picks.push({
        playerId: p.player_id,
        rosterId,
        round: p.round,
        pickNo: p.pick_no,
        isKeeper: p.is_keeper === true,
        name: name || null,
        position: p.metadata?.position ?? null,
      })
    }
    return { picks, error: null }
  } catch (err) {
    return { picks: [], error: err instanceof Error ? err.message : String(err) }
  }
}

export async function loadSeasonRaw(
  client: SleeperClient,
  season: SeasonStandings,
): Promise<SeasonRaw> {
  const cached = cacheGet(season.leagueId)
  if (cached && cached.complete && !cached.draftError) return cached

  const [{ picks, error }, ...weekly] = await Promise.all([
    loadDraftPicks(client, season.leagueId),
    ...season.weeksPlayed.map((w) =>
      client.getMatchups(season.leagueId, w).catch(() => [] as SleeperMatchup[]),
    ),
  ])
  const matchupsByWeek: Record<number, SleeperMatchup[]> = {}
  season.weeksPlayed.forEach((w, i) => (matchupsByWeek[w] = (weekly[i] ?? []).map(compact)))

  const raw: SeasonRaw = {
    season: Number(season.season),
    leagueId: season.leagueId,
    complete: season.complete,
    picks,
    matchupsByWeek,
    teams: teamsFromStandings(season),
    draftError: error,
  }
  if (raw.complete && !raw.draftError) cacheSet(season.leagueId, raw)
  return raw
}

/** Every season in the history, newest first. */
export function loadKeeperSuccessRaw(
  history: LeagueHistory,
  onProgress: (message: string) => void = () => undefined,
  client: SleeperClient = sleeper,
): Promise<SeasonRaw[]> {
  // Seasons typed in from before Sleeper have no draft or matchups to read.
  const seasons = history.seasons.filter(
    (s) => s.source !== 'manual' && s.source !== 'sleeper-summary',
  )
  let done = 0
  return mapLimit(seasons, CONCURRENCY, async (season) => {
    const raw = await loadSeasonRaw(client, season)
    done += 1
    onProgress(`Read ${done} of ${seasons.length} drafts and seasons…`)
    return raw
  })
}
