/** Row shapes for the tables in supabase/schema.sql that the site reads. */

export interface LeagueSettings {
  id: 1
  league_name: string
  invite_code: string
  season: number
  season_start: string
  default_stake: number
  loser_adds_leg: boolean
  sleeper_league_id: string | null
  updated_at: string
}

export interface Profile {
  id: string
  display_name: string
  team_name: string | null
  is_commissioner: boolean
  sleeper_user_id: string | null
  /** A Sleeper team listed by the commissioner before that person signed up. */
  is_placeholder: boolean
  created_at: string
}

export interface DraftOrderEntry {
  slot: number
  teamName: string
  ownerName: string
  /** Lottery seed the team entered with (1 = worst record); null when hand-entered. */
  seed: number | null
  sleeperRosterId: number | null
  sleeperUserId: string | null
  record: string | null
  avatarUrl: string | null
}

export interface DraftOrderLottery {
  seedUsed: number
  timestamp: string
  /** Team ids in lottery pick order (index 0 = #1 pick). */
  pickOrder: string[]
  oddsBps: number[]
  slotMode: string
}

export interface DraftOrder {
  id: string
  season: number
  league_name: string
  entries: DraftOrderEntry[]
  lottery: DraftOrderLottery | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface KeeperList {
  id: string
  season: number
  sleeper_league_id: string
  player_ids: string[]
  updated_by: string | null
  updated_at: string
}

export type SuggestionStatus = 'new' | 'filed' | 'done' | 'declined'

export interface StatSuggestion {
  id: string
  user_id: string | null
  title: string
  description: string | null
  status: SuggestionStatus
  issue_number: number | null
  issue_url: string | null
  created_at: string
  filed_at: string | null
}

export type StatScope = 'player' | 'team' | 'league'

export interface StatDefinition {
  id: string
  key: string
  label: string
  description: string | null
  unit: string | null
  scope: StatScope
  created_by: string | null
  created_at: string
}

export interface StatEntry {
  id: string
  definition_id: string
  season: number
  /** 0 = season total. */
  week: number
  subject: string
  value: number
  note: string | null
  source_url: string | null
  entered_by: string | null
  created_at: string
  updated_at: string
}

// ---- Loser parlay tracker -------------------------------------------------

export type ParlayResult = 'pending' | 'won' | 'lost' | 'push' | 'void'
export type LegMarket = 'spread' | 'moneyline' | 'total' | 'prop' | 'other'

export interface Week {
  id: string
  season: number
  week: number
  loser_id: string | null
  low_score: number | null
  stake: number
  lock_at: string | null
  parlay_result: ParlayResult
  payout: number | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface OddsRef {
  market: 'h2h' | 'spreads' | 'totals'
  outcome: string
  point: number | null
}

export interface Leg {
  id: string
  week_id: string
  user_id: string
  game_id: string | null
  game: string | null
  market: LegMarket
  pick: string
  odds: number | null
  odds_ref: OddsRef | null
  result: ParlayResult
  entered_by: string | null
  created_at: string
  updated_at: string
}

export interface Game {
  id: string
  event_id: string
  season: number
  week: number
  commence_time: string
  home_team: string
  away_team: string
  updated_at: string
}

export interface GameOdds {
  id: string
  game_id: string
  bookmaker: string
  market: 'h2h' | 'spreads' | 'totals'
  outcome: string
  point: number | null
  price: number
  fetched_at: string
}
