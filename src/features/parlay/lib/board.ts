// Turns raw bookmaker rows into one line per outcome: the most common point
// (spread / total) across books, with the best price at that point.
import type { Game, GameOdds, Leg, OddsRef } from '../../../lib/db.ts'

export type BoardMarket = GameOdds['market']

export interface BoardLine {
  outcome: string
  point: number | null
  price: number | null
  bookmaker?: string
  books: number
}

export interface GameBoard {
  game: Game
  markets: Record<BoardMarket, BoardLine[]>
  fetchedAt: string | undefined
}

export function summariseGame(game: Game, oddsRows: readonly GameOdds[]): GameBoard {
  const markets = { h2h: [], spreads: [], totals: [] } as Record<BoardMarket, BoardLine[]>
  for (const market of ['h2h', 'spreads', 'totals'] as const) {
    const mrows = oddsRows.filter((r) => r.market === market)
    const outcomes = [...new Set(mrows.map((r) => r.outcome))]
    markets[market] = outcomes.map((outcome) =>
      bestLine(
        mrows.filter((r) => r.outcome === outcome),
        market,
        outcome,
      ),
    )
  }
  for (const m of ['h2h', 'spreads'] as const) {
    markets[m].sort((a, b) =>
      a.outcome === game.away_team ? -1 : b.outcome === game.away_team ? 1 : 0,
    )
  }
  markets.totals.sort((a, b) => (a.outcome === 'Over' ? -1 : b.outcome === 'Over' ? 1 : 0))
  return { game, markets, fetchedAt: oddsRows[0]?.fetched_at }
}

/**
 * Best price for one outcome. If `point` is given (refreshing an existing leg)
 * only books at that exact number count; otherwise use the consensus number.
 */
export function bestLine(
  rows: readonly GameOdds[],
  market: BoardMarket,
  outcome: string,
  point: number | null | undefined = undefined,
): BoardLine {
  const orows = rows.filter((r) => r.market === market && r.outcome === outcome)
  let usePoint: number | null | undefined = point
  if (market !== 'h2h' && usePoint === undefined) {
    const counts = new Map<number | null, number>()
    for (const r of orows) counts.set(r.point, (counts.get(r.point) ?? 0) + 1)
    usePoint = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const atPoint =
    market === 'h2h' ? orows : orows.filter((r) => Number(r.point) === Number(usePoint))
  const best = atPoint.reduce<GameOdds | null>(
    (acc, r) => (acc === null || r.price > acc.price ? r : acc),
    null,
  )
  return {
    outcome,
    point: market === 'h2h' ? null : (usePoint ?? null),
    price: best?.price ?? null,
    bookmaker: best?.bookmaker,
    books: atPoint.length,
  }
}

export function summariseBoard(games: readonly Game[], oddsRows: readonly GameOdds[]): GameBoard[] {
  const byGame = new Map<string, GameOdds[]>()
  for (const row of oddsRows) {
    const list = byGame.get(row.game_id) ?? []
    list.push(row)
    byGame.set(row.game_id, list)
  }
  return games.map((g) => summariseGame(g, byGame.get(g.id) ?? []))
}

export function formatPoint(p: number | null | undefined, market: string): string {
  if (p === null || p === undefined) return ''
  const n = Number(p)
  if (market === 'spreads' || market === 'spread') return n > 0 ? `+${n}` : `${n}`
  return `${n}`
}

export interface LegPrefill {
  game: string
  market: Leg['market']
  pick: string
  odds: number | null
  game_id: string
  odds_ref: OddsRef
}

/** Build the leg fields for a board line. */
export function legFromLine(game: Game, market: BoardMarket, line: BoardLine): LegPrefill {
  const gameName = `${game.away_team} @ ${game.home_team}`
  let pick: string
  let type: Leg['market']
  if (market === 'h2h') {
    pick = `${line.outcome} ML`
    type = 'moneyline'
  } else if (market === 'spreads') {
    pick = `${line.outcome} ${formatPoint(line.point, market)}`
    type = 'spread'
  } else {
    pick = `${line.outcome} ${formatPoint(line.point, market)}`
    type = 'total'
  }
  return {
    game: gameName,
    market: type,
    pick,
    odds: line.price,
    game_id: game.id,
    odds_ref: { market, outcome: line.outcome, point: line.point },
  }
}
