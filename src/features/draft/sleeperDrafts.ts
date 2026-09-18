/**
 * Past draft orders straight from Sleeper: every season in the league's
 * history has a draft whose slot order Sleeper records. This walks the
 * league chain and maps each draft's slots to teams. Completed seasons are
 * cached in localStorage.
 */
import { loadLeagueChain } from '../standings/history.ts'
import type { DraftOrderEntry } from '../../lib/db.ts'
import { mapLimit, sleeper, userAvatarUrl, type SleeperClient } from '../../lib/sleeper/client.ts'
import type {
  SleeperDraft,
  SleeperLeague,
  SleeperRoster,
  SleeperUser,
} from '../../lib/sleeper/types.ts'

const CACHE_PREFIX = 'wkt.drafts:v1:'
const CONCURRENCY = 4

export interface SleeperDraftOrder {
  season: number
  leagueId: string
  leagueName: string
  draftId: string
  draftType: string
  status: string
  /** Epoch ms when the draft started, if Sleeper knows. */
  startTime: number | null
  entries: DraftOrderEntry[]
}

/** Slot -> team from a Sleeper draft, using slot_to_roster_id or, failing that, draft_order. */
export function entriesFromDraft(
  draft: Pick<SleeperDraft, 'slot_to_roster_id' | 'draft_order' | 'settings'>,
  rosters: readonly SleeperRoster[],
  users: readonly SleeperUser[],
): DraftOrderEntry[] {
  const userById = new Map(users.map((u) => [u.user_id, u]))
  const rosterById = new Map(rosters.map((r) => [r.roster_id, r]))
  const slots = new Map<number, { rosterId: number | null; userId: string | null }>()

  for (const [slot, rosterId] of Object.entries(draft.slot_to_roster_id ?? {})) {
    const roster = rosterById.get(Number(rosterId))
    slots.set(Number(slot), { rosterId: Number(rosterId), userId: roster?.owner_id ?? null })
  }
  for (const [userId, slot] of Object.entries(draft.draft_order ?? {})) {
    if (slots.has(Number(slot))) continue
    const roster = rosters.find((r) => r.owner_id === userId)
    slots.set(Number(slot), { rosterId: roster?.roster_id ?? null, userId })
  }

  const count = Math.max(slots.size, Number(draft.settings?.teams ?? 0))
  const entries: DraftOrderEntry[] = []
  for (let slot = 1; slot <= count; slot++) {
    const s = slots.get(slot)
    const user = s?.userId ? userById.get(s.userId) : undefined
    const fallback = s?.rosterId ? `Roster ${s.rosterId}` : 'Open slot'
    entries.push({
      slot,
      teamName: user?.metadata?.team_name || user?.display_name || fallback,
      ownerName: user?.display_name ?? fallback,
      seed: null,
      sleeperRosterId: s?.rosterId ?? null,
      sleeperUserId: s?.userId ?? null,
      record: null,
      avatarUrl: userAvatarUrl(user),
    })
  }
  return entries
}

function cacheGet(leagueId: string): SleeperDraftOrder | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + leagueId)
    return raw ? (JSON.parse(raw) as SleeperDraftOrder) : null
  } catch {
    return null
  }
}

function cacheSet(leagueId: string, value: SleeperDraftOrder): void {
  try {
    localStorage.setItem(CACHE_PREFIX + leagueId, JSON.stringify(value))
  } catch {
    /* quota or private mode: ignore */
  }
}

async function loadSeasonDraft(
  client: SleeperClient,
  league: SleeperLeague,
): Promise<SleeperDraftOrder | null> {
  const cached = cacheGet(league.league_id)
  if (cached && league.status === 'complete') return cached
  const drafts = await client.getDrafts(league.league_id)
  const draft = drafts.find((d) => d.status === 'complete') ?? drafts[0]
  if (!draft) return null
  const hasOrder =
    Object.keys(draft.slot_to_roster_id ?? {}).length > 0 ||
    Object.keys(draft.draft_order ?? {}).length > 0
  if (!hasOrder) return null
  const [rosters, users] = await Promise.all([
    client.getRosters(league.league_id),
    client.getUsers(league.league_id),
  ])
  const order: SleeperDraftOrder = {
    season: Number(league.season),
    leagueId: league.league_id,
    leagueName: league.name,
    draftId: draft.draft_id,
    draftType: draft.type,
    status: draft.status,
    startTime: draft.start_time ?? null,
    entries: entriesFromDraft(draft, rosters, users),
  }
  if (league.status === 'complete' && draft.status === 'complete') cacheSet(league.league_id, order)
  return order
}

/** Every season's draft order from Sleeper, newest first. Seasons without a set order are skipped. */
export async function loadSleeperDraftOrders(
  leagueId: string,
  client: SleeperClient = sleeper,
): Promise<SleeperDraftOrder[]> {
  const leagues = await loadLeagueChain(client, leagueId, () => undefined)
  const orders = await mapLimit(leagues, CONCURRENCY, (league) =>
    loadSeasonDraft(client, league).catch(() => null),
  )
  return orders
    .filter((o): o is SleeperDraftOrder => o !== null)
    .sort((a, b) => b.season - a.season)
}
