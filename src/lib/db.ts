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
