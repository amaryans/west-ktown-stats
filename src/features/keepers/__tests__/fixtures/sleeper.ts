/**
 * Hand-authored Sleeper payloads for a 4-team league, shaped per docs.sleeper.com.
 * Scenario coverage: round-1 DQ, kept-player DQ (auto-detect), own-round-5 and
 * own-round-8 keeps, an acquired player, a drafted free agent, an undrafted
 * waiver pickup, and an orphan pick with a null roster_id (slot fallback).
 */
import type {
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperRoster,
  SleeperTransaction,
  SleeperUser,
} from '../../api/sleeper'

/** 2024 draft start; transactions before this are pre-draft placements. */
export const DRAFT_START = 1_725_000_000_000

export const league2025: SleeperLeague = {
  league_id: 'L2025',
  name: 'Fixture Keeper League',
  season: '2025',
  status: 'pre_draft',
  sport: 'nfl',
  total_rosters: 4,
  previous_league_id: 'L2024',
  draft_id: 'D2025',
}

export const league2024: SleeperLeague = {
  league_id: 'L2024',
  name: 'Fixture Keeper League',
  season: '2024',
  status: 'complete',
  sport: 'nfl',
  total_rosters: 4,
  previous_league_id: null,
  draft_id: 'D2024',
}

export const users2024: SleeperUser[] = [
  { user_id: 'u1', display_name: 'Alice', metadata: { team_name: "Alice's Aces" } },
  { user_id: 'u2', display_name: 'Bob', metadata: null },
  { user_id: 'u3', display_name: 'Cara' },
  { user_id: 'u4', display_name: 'Dan' },
]

export const rosters2024: SleeperRoster[] = [
  { roster_id: 1, owner_id: 'u1', players: ['p_qb1', 'p_own5', 'p_own8', 'p_acq', 'p_tk'] },
  { roster_id: 2, owner_id: 'u2', players: ['p_kept', 'p_early'] },
  { roster_id: 3, owner_id: 'u3', players: ['p_prek'] },
  { roster_id: 4, owner_id: 'u4', players: ['p_wire'] },
]

export const drafts2024: SleeperDraft[] = [
  {
    draft_id: 'D2024',
    type: 'snake',
    status: 'complete',
    season: '2024',
    start_time: DRAFT_START,
    settings: { rounds: 15 },
    slot_to_roster_id: { '1': 1, '2': 2, '3': 3, '4': 4 },
  },
]

export const transactions2024: SleeperTransaction[] = [
  // Commissioner placed p_prek on roster 3 before the draft → pre-draft keeper.
  {
    type: 'commissioner',
    status: 'complete',
    status_updated: DRAFT_START - 60_000,
    adds: { p_prek: 3 },
    drops: null,
  },
  // p_early was added pre-draft AND later drafted at its cost slot — the
  // pre-draft add still marks it as a keeper.
  {
    type: 'commissioner',
    status: 'complete',
    status_updated: DRAFT_START - 120_000,
    adds: { p_early: 2 },
    drops: null,
  },
  // Normal post-draft waiver pickup → NOT a keeper.
  {
    type: 'free_agent',
    status: 'complete',
    status_updated: DRAFT_START + 5_000_000,
    adds: { p_wire: 4 },
    drops: null,
  },
  // p_tk carried over pre-draft on roster 3, traded to roster 1 mid-season.
  // Trades must not count as an "entry", so p_tk stays a pre-draft keeper.
  {
    type: 'trade',
    status: 'complete',
    status_updated: DRAFT_START + 9_000_000,
    adds: { p_tk: 1 },
    drops: { p_tk: 3 },
  },
]

const pick = (
  partial: Partial<SleeperDraftPick> & Pick<SleeperDraftPick, 'player_id' | 'round' | 'pick_no'>,
): SleeperDraftPick => ({
  picked_by: '',
  roster_id: null,
  draft_slot: 1,
  is_keeper: null,
  metadata: null,
  ...partial,
})

export const picks2024: SleeperDraftPick[] = [
  // Round 1 pick: disqualified by Rule 1.2.
  pick({
    player_id: 'p_qb1',
    round: 1,
    pick_no: 1,
    roster_id: 1,
    metadata: { first_name: 'Quinn', last_name: 'Backman', position: 'QB', team: 'BUF' },
  }),
  // Kept last season (is_keeper): disqualified by Rule 1.1, auto-detected.
  pick({
    player_id: 'p_kept',
    round: 6,
    pick_no: 22,
    roster_id: 2,
    is_keeper: true,
    metadata: { first_name: 'Kai', last_name: 'Holdover', position: 'RB', team: 'DET' },
  }),
  // Team 1's own round-5 pick, still rostered → 3.1.1 at round 5.
  pick({
    player_id: 'p_own5',
    round: 5,
    pick_no: 17,
    roster_id: 1,
    metadata: { first_name: 'Otto', last_name: 'Fifth', position: 'WR', team: 'KC' },
  }),
  // Team 1's own round-8 pick, still rostered → 3.1.1 at round 8. roster_id is
  // null to exercise the draft-slot fallback mapping.
  pick({
    player_id: 'p_own8',
    round: 8,
    pick_no: 29,
    roster_id: null,
    draft_slot: 1,
    metadata: { first_name: 'Elena', last_name: 'Eighth', position: 'TE', team: 'SF' },
  }),
  // Added pre-draft by the commissioner and then also drafted at its slot.
  pick({
    player_id: 'p_early',
    round: 7,
    pick_no: 26,
    roster_id: 2,
    metadata: { first_name: 'Boarded', last_name: 'Early', position: 'TE', team: 'LV' },
  }),
  // Drafted by Team 2, finished on Team 1's roster → 3.1.2 + contingent 3.2.2.
  pick({
    player_id: 'p_acq',
    round: 9,
    pick_no: 34,
    roster_id: 2,
    metadata: { first_name: 'Ash', last_name: 'Acquired', position: 'WR', team: 'DAL' },
  }),
  // Drafted by Team 3, ended the season a free agent → 3.2.3.
  pick({
    player_id: 'p_fa',
    round: 10,
    pick_no: 39,
    roster_id: 3,
    metadata: { first_name: 'Frank', last_name: 'Agent', position: 'RB', team: 'NYJ' },
  }),
]

/** Minimal players dump entries for undrafted players. */
export const playersDump = {
  p_wire: { full_name: 'Wally Wirefind', position: 'WR', team: 'MIA' },
  p_prek: { full_name: 'Pre Kept', position: 'WR', team: 'CHI' },
  p_tk: { full_name: 'Traded Keeper', position: 'RB', team: 'GB' },
}

/** Routes a Sleeper API URL to its fixture payload; unknown IDs return null like the real API. */
export function fixtureFetch(url: string): unknown {
  const routes: Record<string, unknown> = {
    '/league/L2025': league2025,
    '/league/L2024': league2024,
    '/league/L2024/rosters': rosters2024,
    '/league/L2024/users': users2024,
    '/league/L2024/drafts': drafts2024,
    '/draft/D2024/picks': picks2024,
    '/players/nfl': playersDump,
  }
  const path = url.replace(/^.*\/v1/, '')
  const transactionsMatch = path.match(/^\/league\/L2024\/transactions\/(\d+)$/)
  if (transactionsMatch !== null) return transactionsMatch[1] === '1' ? transactions2024 : []
  return path in routes ? routes[path] : null
}
