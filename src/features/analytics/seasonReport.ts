/*
 * Everything the trades, draft and report card pages derive for one season,
 * computed together so each page reads from the same numbers.
 */
import type { SeasonStandings } from '../standings/history.ts'
import { seasonLuck } from './allplay.ts'
import { gradePicks, summariseDrafts, type DraftSummary, type GradedPick } from './draft.ts'
import { executionByRoster, rosterWeeks, type ExecutionLine } from './execution.ts'
import type { LineupSeason } from './lineupLoader.ts'
import { seasonCards, type Card } from './reportCard.ts'
import {
  creditMoves,
  gradeTrades,
  managerMoves,
  pickups,
  type ManagerMoves,
  type Move,
  type Pickup,
  type TradeGrade,
} from './transactions.ts'

export interface SeasonReport {
  standings: SeasonStandings
  trades: TradeGrade[]
  pickups: Pickup[]
  moves: Map<number, ManagerMoves>
  picks: GradedPick[]
  drafts: Map<number, DraftSummary>
  execution: Map<number, ExecutionLine>
  cards: Map<number, Card>
  /** The draft could not be read. */
  draftError: string | null
}

export function seasonReport(
  standings: SeasonStandings,
  lineup: LineupSeason,
  moves: readonly Move[],
  positions: {
    positionsOf: (playerId: string) => readonly string[]
    primaryPosition: (playerId: string) => string | null
  },
): SeasonReport {
  const rosterIds = standings.teams.map((t) => t.rosterId)
  const credits = creditMoves(moves, lineup.matchupsByWeek)
  const trades = gradeTrades(moves, credits)
  const adds = pickups(moves, credits)
  const managers = new Map(managerMoves(rosterIds, trades, adds).map((m) => [m.rosterId, m]))
  const picks = gradePicks(lineup.picks, lineup.matchupsByWeek)
  const drafts = new Map(summariseDrafts(picks).map((d) => [d.rosterId, d]))
  const execution =
    lineup.rosterPositions.length > 0
      ? executionByRoster(rosterWeeks({ ...lineup, ...positions }))
      : new Map<number, ExecutionLine>()
  const luck = new Map(seasonLuck(standings).map((l) => [l.rosterId, l]))
  const cards = seasonCards(
    rosterIds.map((rosterId) => ({
      rosterId,
      raw: {
        draft: drafts.get(rosterId)?.starterPoints ?? null,
        waivers: managers.get(rosterId)?.pickupPoints ?? null,
        trades: managers.get(rosterId)?.tradeNet ?? null,
        lineups: execution.get(rosterId)?.efficiency ?? null,
      },
      luck: luck.get(rosterId)?.weeks ? (luck.get(rosterId)?.luck ?? null) : null,
    })),
  )
  return {
    standings,
    trades,
    pickups: adds,
    moves: managers,
    picks,
    drafts,
    execution,
    cards: new Map(cards.map((c) => [c.rosterId, c])),
    draftError: drafts.size === 0 ? (lineup.draftError ?? 'No draft found.') : null,
  }
}
