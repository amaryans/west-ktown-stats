import type { EngineInput, PlayerId, Team, TeamId } from '../engine'
import type {
  SleeperClient,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperPlayer,
  SleeperRoster,
  SleeperTransaction,
} from './sleeper'

/** A league we can't compute keepers for (bad chain, auction draft, no draft…). */
export class UnsupportedLeagueError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedLeagueError'
  }
}

export interface PlayerInfo {
  name: string
  position?: string
  nflTeam?: string
}

export type KeeperDetectionSource = 'keeper-flag' | 'pre-draft-roster'

export interface KeeperDetection {
  playerId: PlayerId
  source: KeeperDetectionSource
  /** Best-known roster association (final roster, else the roster that dropped them). */
  teamId?: TeamId
}

/** A draft-board slot nobody picked at — the league's convention for keeper slots. */
export interface SkippedDraftSlot {
  round: number
  slot: number
  teamId?: TeamId
}

export interface AssembledData {
  enteredLeague: { id: string; name: string; season: string; status: string }
  previousLeague: { id: string; name: string; season: string }
  upcomingSeason: string
  draft: { id: string; type: string; rounds?: number; startTime?: number }
  engineInput: EngineInput
  /** Union of all keeper detections (R7: reviewable in the UI). */
  autoDetectedKeepers: PlayerId[]
  /** Per-player detection detail: is_keeper flags plus pre-draft roster presence. */
  keeperDetection: KeeperDetection[]
  skippedDraftSlots: SkippedDraftSlot[]
  playerInfo: Record<PlayerId, PlayerInfo>
  warnings: string[]
}

const MAX_CHAIN_HOPS = 4

/**
 * The user may paste either season's league ID. Walk previous_league_id until
 * a completed season is found — that season's draft, rosters, and keepers feed
 * the engine.
 */
export async function resolvePreviousLeague(
  client: SleeperClient,
  enteredLeagueId: string,
  options: { exact?: boolean } = {},
): Promise<{ entered: SleeperLeague; previous: SleeperLeague; warnings: string[] }> {
  const entered = await client.getLeague(enteredLeagueId)
  const warnings: string[] = []
  let current = entered
  let hops = 0
  // `exact` reads the entered season itself even if it is still in progress:
  // once its draft is done, the keepers used in it can be recorded.
  while (!options.exact && current.status !== 'complete') {
    if (!current.previous_league_id) {
      throw new UnsupportedLeagueError(
        `League "${current.name}" (${current.season}) has not completed its season and has no ` +
          `previous-season link on Sleeper. Enter last season's league ID directly.`,
      )
    }
    if (++hops > MAX_CHAIN_HOPS) {
      throw new UnsupportedLeagueError("No completed season found in this league's history.")
    }
    current = await client.getLeague(current.previous_league_id)
  }
  if (hops > 1) {
    warnings.push(
      `Walked back ${hops} seasons to the most recent completed one (${current.season}); ` +
        `check that this is the season your keeper rules should read from.`,
    )
  }
  return { entered, previous: current, warnings }
}

/**
 * Fetches everything the engine needs for the previous season and maps it into
 * EngineInput. Pass a players dump (optional) to name never-drafted players.
 */
export async function assembleFromLeagueId(
  client: SleeperClient,
  enteredLeagueId: string,
  options: { playersDump?: Record<string, SleeperPlayer>; exact?: boolean } = {},
): Promise<AssembledData> {
  const { entered, previous, warnings } = await resolvePreviousLeague(client, enteredLeagueId, {
    exact: options.exact,
  })

  const [rosters, users, drafts, transactions] = await Promise.all([
    client.getRosters(previous.league_id),
    client.getUsers(previous.league_id),
    client.getDrafts(previous.league_id),
    fetchSeasonTransactions(client, previous.league_id, warnings),
  ])

  const draft = drafts[0]
  if (draft === undefined) {
    throw new UnsupportedLeagueError(
      `No draft found for the ${previous.season} season of "${previous.name}".`,
    )
  }
  if (drafts.length > 1) {
    warnings.push(`Found ${drafts.length} drafts for ${previous.season}; using ${draft.draft_id}.`)
  }
  if (draft.type === 'auction') {
    // Ruling R8: the keeper rules are round-based.
    throw new UnsupportedLeagueError(
      'Auction drafts are not supported — keeper costs are round-based.',
    )
  }
  if (draft.status !== 'complete') {
    warnings.push(
      `The ${previous.season} draft has status "${draft.status}" (expected "complete").`,
    )
  }

  const picks = await client.getDraftPicks(draft.draft_id)

  const usersById = new Map(users.map((user) => [user.user_id, user]))
  const teams: Team[] = rosters.map((roster) => {
    const owner = roster.owner_id === null ? undefined : usersById.get(roster.owner_id)
    if (owner === undefined) {
      warnings.push(`Roster ${roster.roster_id} has no matching manager; using a placeholder name.`)
    }
    return {
      id: roster.roster_id,
      name: owner?.metadata?.team_name || owner?.display_name || `Roster ${roster.roster_id}`,
      ownerId: roster.owner_id ?? '',
    }
  })

  const slotToRoster = draft.slot_to_roster_id ?? null
  const draftPicks: EngineInput['draftPicks'] = []
  let slotFallbacks = 0
  for (const pick of picks) {
    if (pick.player_id === null || pick.player_id === '') {
      warnings.push(`Skipping draft pick #${pick.pick_no}: it has no player.`)
      continue
    }
    let teamId: TeamId | null | undefined = pick.roster_id
    if (teamId === null || teamId === undefined) {
      teamId = slotToRoster?.[String(pick.draft_slot)]
      if (teamId !== undefined) slotFallbacks += 1
    }
    if (teamId === null || teamId === undefined) {
      warnings.push(`Skipping draft pick #${pick.pick_no}: cannot map it to a roster.`)
      continue
    }
    draftPicks.push({
      playerId: pick.player_id,
      teamId,
      round: pick.round,
      isKeeper: pick.is_keeper === true,
    })
  }
  if (slotFallbacks > 0) {
    warnings.push(`Mapped ${slotFallbacks} draft picks to rosters via draft-slot fallback.`)
  }

  const finalRosters: Record<TeamId, PlayerId[]> = {}
  for (const roster of rosters) {
    finalRosters[roster.roster_id] = roster.players ?? []
    if (!roster.players || roster.players.length === 0) {
      warnings.push(`Roster ${roster.roster_id} has an empty final roster.`)
    }
  }

  const flaggedKeepers = draftPicks.filter((pick) => pick.isKeeper).map((pick) => pick.playerId)
  const draftedIds = new Set(draftPicks.map((pick) => pick.playerId))
  if (draft.start_time == null) {
    warnings.push(
      'The previous draft has no start time on Sleeper; pre-draft keeper detection only ' +
        'covers players who were never acquired in-season.',
    )
  }
  const preDraftPlayers = detectPreDraftPlayers(
    draftedIds,
    finalRosters,
    transactions,
    draft.start_time,
  )
  const keeperDetection: KeeperDetection[] = [
    ...flaggedKeepers.map((playerId) => ({ playerId, source: 'keeper-flag' as const })),
    ...preDraftPlayers
      .filter(({ playerId }) => !flaggedKeepers.includes(playerId))
      .map(({ playerId, teamId }) => ({ playerId, source: 'pre-draft-roster' as const, teamId })),
  ]
  const autoDetectedKeepers = keeperDetection.map((detection) => detection.playerId)
  if (autoDetectedKeepers.length === 0) {
    warnings.push(
      'No keepers were auto-detected from the previous draft. If your league kept players ' +
        'last season, add them in the keeper review step (they disqualify re-keeping).',
    )
  }

  const engineInput: EngineInput = {
    teams,
    draftPicks,
    finalRosters,
    previousKeepers: new Set(autoDetectedKeepers),
  }

  return {
    enteredLeague: {
      id: entered.league_id,
      name: entered.name,
      season: entered.season,
      status: entered.status,
    },
    previousLeague: { id: previous.league_id, name: previous.name, season: previous.season },
    upcomingSeason:
      entered.league_id === previous.league_id
        ? String(Number(previous.season) + 1)
        : entered.season,
    draft: {
      id: draft.draft_id,
      type: draft.type,
      rounds: draft.settings?.rounds,
      startTime: draft.start_time ?? undefined,
    },
    engineInput,
    autoDetectedKeepers,
    keeperDetection,
    skippedDraftSlots: findSkippedSlots(draft, picks, rosters.length),
    playerInfo: collectPlayerInfo(picks, rosters, options.playersDump),
    warnings,
  }
}

/** R7: layer the user's manual keeper review on top of auto-detection. */
export function withKeeperEdits(
  input: EngineInput,
  edits: { add?: PlayerId[]; remove?: PlayerId[] },
): EngineInput {
  const previousKeepers = new Set(input.previousKeepers)
  for (const playerId of edits.add ?? []) previousKeepers.add(playerId)
  for (const playerId of edits.remove ?? []) previousKeepers.delete(playerId)
  return { ...input, previousKeepers }
}

/**
 * Names come free from draft-pick metadata for every drafted player; the big
 * players dump is only consulted for never-drafted roster players.
 */
export function collectPlayerInfo(
  picks: SleeperDraftPick[],
  rosters: SleeperRoster[],
  playersDump?: Record<string, SleeperPlayer>,
): Record<PlayerId, PlayerInfo> {
  const info: Record<PlayerId, PlayerInfo> = {}
  for (const pick of picks) {
    if (!pick.player_id || !pick.metadata) continue
    const name = [pick.metadata.first_name, pick.metadata.last_name].filter(Boolean).join(' ')
    if (name === '') continue
    info[pick.player_id] = {
      name,
      position: pick.metadata.position ?? undefined,
      nflTeam: pick.metadata.team ?? undefined,
    }
  }
  if (playersDump) {
    for (const roster of rosters) {
      for (const playerId of roster.players ?? []) {
        if (info[playerId] !== undefined) continue
        const player = playersDump[playerId]
        if (player === undefined) continue
        const name =
          player.full_name ?? [player.first_name, player.last_name].filter(Boolean).join(' ')
        info[playerId] = {
          name: name || playerId,
          position: player.position ?? undefined,
          nflTeam: player.team ?? undefined,
        }
      }
    }
  }
  return info
}

// Week 0 first: some leagues file pre-season commissioner moves there.
const TRANSACTION_WEEKS = Array.from({ length: 19 }, (_, index) => index)

async function fetchSeasonTransactions(
  client: SleeperClient,
  leagueId: string,
  warnings: string[],
): Promise<SleeperTransaction[]> {
  const perWeek = await Promise.all(
    TRANSACTION_WEEKS.map(async (week) => {
      try {
        return { week, transactions: await client.getTransactions(leagueId, week) }
      } catch {
        return { week, transactions: null }
      }
    }),
  )
  // Week 0 not existing is normal; missing in-season weeks are worth a warning.
  const failures = perWeek.filter((entry) => entry.transactions === null && entry.week > 0).length
  if (failures > 0) {
    warnings.push(
      `Transactions for ${failures} week(s) could not be loaded; pre-draft keeper ` +
        `detection may be incomplete.`,
    )
  }
  return perWeek.flatMap((entry) => entry.transactions ?? [])
}

/**
 * The league's keeper convention: kept players are already on rosters when the
 * draft starts, and their draft slots get skipped. So a player who appeared on
 * a roster during the season, was never drafted that season, and whose first
 * non-trade acquisition doesn't postdate the draft start must have been on the
 * board before the draft — a keeper.
 *
 * Trades are ignored when deciding how a player *entered* rosters (they only
 * move players between them), and a drop that precedes every acquisition also
 * proves pre-draft presence. Transactions without timestamps are treated as
 * post-draft, biasing against false keeper positives.
 */
export function detectPreDraftPlayers(
  draftedPlayerIds: ReadonlySet<PlayerId>,
  finalRosters: Record<TeamId, PlayerId[]>,
  transactions: SleeperTransaction[],
  draftStartTime: number | null | undefined,
): { playerId: PlayerId; teamId?: TeamId }[] {
  const completed = transactions.filter((transaction) => transaction.status === 'complete')

  const earliestAdd = new Map<PlayerId, number>()
  const earliestDrop = new Map<PlayerId, number>()
  const rosterHint = new Map<PlayerId, TeamId>()

  for (const transaction of completed) {
    const at = transaction.status_updated ?? transaction.created ?? null
    if (transaction.type !== 'trade' && transaction.adds) {
      const stamp = at ?? Number.MAX_SAFE_INTEGER
      for (const playerId of Object.keys(transaction.adds)) {
        if (stamp < (earliestAdd.get(playerId) ?? Infinity)) earliestAdd.set(playerId, stamp)
      }
    }
    if (transaction.drops) {
      for (const [playerId, rosterId] of Object.entries(transaction.drops)) {
        if (at !== null && at < (earliestDrop.get(playerId) ?? Infinity)) {
          earliestDrop.set(playerId, at)
        }
        if (!rosterHint.has(playerId)) rosterHint.set(playerId, rosterId)
      }
    }
  }

  // Everyone who was demonstrably on a roster: season-end rosters, dropped
  // players, and pre-draft commissioner placements.
  const candidates = new Map<PlayerId, TeamId | undefined>()
  for (const [teamKey, players] of Object.entries(finalRosters)) {
    for (const playerId of players) candidates.set(playerId, Number(teamKey))
  }
  for (const [playerId, rosterId] of rosterHint) {
    if (!candidates.has(playerId)) candidates.set(playerId, rosterId)
  }
  if (draftStartTime != null) {
    for (const transaction of completed) {
      if (transaction.type === 'trade' || !transaction.adds) continue
      const at = transaction.status_updated ?? transaction.created ?? null
      if (at === null || at > draftStartTime) continue
      for (const [playerId, rosterId] of Object.entries(transaction.adds)) {
        if (!candidates.has(playerId)) candidates.set(playerId, rosterId)
      }
    }
  }

  const results: { playerId: PlayerId; teamId?: TeamId }[] = []
  for (const [playerId, teamId] of candidates) {
    const addAt = earliestAdd.get(playerId)
    const dropAt = earliestDrop.get(playerId)
    const addedPreDraft = draftStartTime != null && addAt !== undefined && addAt <= draftStartTime
    if (draftedPlayerIds.has(playerId)) {
      // A pre-draft add proves pre-boarding even for players who also went
      // through the draft board — the league may draft keepers at their cost
      // slot, which would otherwise make them look like ordinary picks.
      if (addedPreDraft) results.push({ playerId, teamId })
      continue
    }
    const onBoardPreDraft =
      addAt === undefined || addedPreDraft || (dropAt !== undefined && dropAt < addAt)
    if (onBoardPreDraft) results.push({ playerId, teamId })
  }
  results.sort((a, b) => a.playerId.localeCompare(b.playerId))
  return results
}

/**
 * Board slots nobody picked at. A sparse picks payload (less than half the
 * board) is treated as incomplete data rather than a board full of skips.
 */
export function findSkippedSlots(
  draft: SleeperDraft,
  picks: SleeperDraftPick[],
  teamCount: number,
): SkippedDraftSlot[] {
  const rounds = draft.settings?.rounds
  if (rounds === undefined || rounds === 0 || teamCount === 0) return []
  const made = new Set(
    picks.filter((pick) => pick.player_id).map((pick) => `${pick.round}:${pick.draft_slot}`),
  )
  if (made.size < (rounds * teamCount) / 2) return []
  const skipped: SkippedDraftSlot[] = []
  for (let round = 1; round <= rounds; round += 1) {
    for (let slot = 1; slot <= teamCount; slot += 1) {
      if (!made.has(`${round}:${slot}`)) {
        skipped.push({ round, slot, teamId: draft.slot_to_roster_id?.[String(slot)] })
      }
    }
  }
  return skipped
}
