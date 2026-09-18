/** Raw response shapes from the public Sleeper API (only the fields we consume). */

export interface SleeperLeague {
  league_id: string
  name: string
  /** Season year as a string, e.g. "2025". */
  season: string
  status: 'pre_draft' | 'drafting' | 'in_season' | 'complete' | (string & {})
  sport?: string
  avatar?: string | null
  previous_league_id: string | null
  total_rosters: number
  draft_id?: string | null
  settings?: {
    playoff_week_start?: number
    league_average_match?: number
    [key: string]: number | undefined
  } | null
}

export interface SleeperRosterSettings {
  wins: number
  losses: number
  ties: number
  fpts: number
  fpts_decimal?: number
  fpts_against?: number
  fpts_against_decimal?: number
}

export interface SleeperRoster {
  roster_id: number
  /** Null when the owner left the league (orphan roster). */
  owner_id: string | null
  /** All rostered players including bench, IR, and taxi. */
  players?: string[] | null
  starters?: string[] | null
  reserve?: string[] | null
  taxi?: string[] | null
  settings?: SleeperRosterSettings | null
}

export interface SleeperUser {
  user_id: string
  display_name: string
  /** Sleeper avatar id (not a URL), null if the user has none. */
  avatar?: string | null
  metadata?: {
    team_name?: string | null
    /** Custom team avatar — a full URL when present. */
    avatar?: string | null
  } | null
}

export interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  points: number | null
  starters?: string[] | null
  players_points?: Record<string, number> | null
}

export interface SleeperBracketMatchup {
  r: number
  m: number
  t1: number | null
  t2: number | null
  w: number | null
  l: number | null
  /** Placement game marker: winner finishes in place p, loser in place p+1. */
  p?: number
}

export interface SleeperDraft {
  draft_id: string
  type: 'snake' | 'linear' | 'auction' | (string & {})
  status: string
  season: string
  /** Epoch milliseconds; separates pre-draft roster placement from in-season moves. */
  start_time?: number | null
  settings?: ({ rounds?: number } & Record<string, number>) | null
  /** Draft slot (1-based, as string keys) → roster_id. */
  slot_to_roster_id?: Record<string, number> | null
  /** user_id → draft slot. */
  draft_order?: Record<string, number> | null
}

export interface SleeperTransaction {
  type: 'free_agent' | 'waiver' | 'trade' | 'commissioner' | (string & {})
  status: 'complete' | (string & {})
  created?: number | null
  status_updated?: number | null
  /** player_id → receiving roster_id. */
  adds?: Record<string, number> | null
  /** player_id → releasing roster_id. */
  drops?: Record<string, number> | null
}

export interface SleeperDraftPick {
  player_id: string | null
  picked_by: string
  roster_id: number | null
  round: number
  pick_no: number
  draft_slot: number
  is_keeper: boolean | null
  metadata?: {
    first_name?: string | null
    last_name?: string | null
    position?: string | null
    team?: string | null
  } | null
}

export interface SleeperState {
  season: string
  league_season: string
  season_type: 'pre' | 'regular' | 'post' | 'off' | (string & {})
  week: number
}

export interface SleeperPlayer {
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  position?: string | null
  team?: string | null
  fantasy_positions?: string[] | null
  status?: string | null
  injury_status?: string | null
  number?: number | null
  age?: number | null
}
