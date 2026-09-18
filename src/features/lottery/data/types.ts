export interface Team {
  /** Stable id: Sleeper roster_id as a string, or a generated id for manual leagues. */
  id: string
  ownerName: string
  teamName: string
  wins: number
  losses: number
  ties: number
  /** Total fantasy points scored — used as the deterministic tiebreaker. */
  pointsFor: number
  /** Avatar image URL (sleepercdn or a data-URL from manual upload), null if none. */
  avatarUrl: string | null
  /** Final playoff placement (1 = champion), null if unknown / didn't place. */
  playoffFinish: number | null
}

export interface League {
  source: 'sleeper' | 'manual'
  sleeperLeagueId?: string
  name: string
  season?: string
  /** Sleeper league id for the prior season, if any — Sleeper mints a new id each year. */
  previousLeagueId?: string
  teams: Team[]
}

export type OrderingSource = 'regularSeason' | 'playoffs'
export type SlotMode = 'winnerChoosesSlot' | 'lotteryIsOrder'

export interface AppSettings {
  orderingSource: OrderingSource
  slotMode: SlotMode
  /** Per-seed odds overrides in basis points (must sum to 10000); null = NBA table. */
  customOddsBps: number[] | null
  /** Per-seed pick floors: worst allowed pick per seed, null entries unprotected. */
  pickFloors: (number | null)[] | null
}

export interface DraftSlotAssignment {
  teamId: string
  /** 1-based draft slot the team will occupy. */
  slot: number
}
