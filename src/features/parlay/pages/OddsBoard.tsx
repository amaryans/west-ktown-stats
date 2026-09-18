import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage, useLeague } from '../../../context/LeagueContext.tsx'
import type { Game, GameOdds } from '../../../lib/db.ts'
import { useParlay } from '../ParlayContext.tsx'
import {
  formatPoint,
  legFromLine,
  summariseBoard,
  type BoardLine,
  type BoardMarket,
} from '../lib/board.ts'
import { formatAmerican } from '../lib/odds.ts'
import { currentNflWeek, defaultLockAt, formatDateTime, MAX_WEEK, weekLabel } from '../lib/week.ts'

const MARKETS: [BoardMarket, string][] = [
  ['spreads', 'Spread'],
  ['h2h', 'Moneyline'],
  ['totals', 'Total'],
]

export default function OddsBoard() {
  const { settings } = useLeague()
  const { games, findWeek, createWeek, loadOddsForWeek } = useParlay()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const currentSeason = settings?.season ?? new Date().getFullYear()
  const season = Number(params.get('season') || currentSeason)
  const weekNum = Number(params.get('week') || currentNflWeek(settings?.season_start))
  const week = findWeek(season, weekNum)
  const weekGames = useMemo(
    () => games.filter((g) => g.season === season && g.week === weekNum),
    [games, season, weekNum],
  )

  const [oddsRows, setOddsRows] = useState<GameOdds[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    loadOddsForWeek(season, weekNum)
      .then((rows) => {
        if (active) setOddsRows(rows)
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, weekNum, games])

  const board = useMemo(() => summariseBoard(weekGames, oddsRows), [weekGames, oddsRows])
  const lastFetched = board
    .map((b) => b.fetchedAt)
    .filter((f): f is string => Boolean(f))
    .sort()
    .at(-1)

  function choose(g: Game, market: BoardMarket, line: BoardLine) {
    navigate(`/parlay/weeks/${season}/${weekNum}`, {
      state: { prefill: legFromLine(g, market, line) },
    })
  }

  async function ensureWeek() {
    await createWeek({
      season,
      week: weekNum,
      stake: settings?.default_stake ?? 5,
      lock_at:
        season === currentSeason && settings?.season_start
          ? defaultLockAt(settings.season_start, weekNum).toISOString()
          : null,
    })
  }

  const availableWeeks = [
    ...new Set(games.filter((g) => g.season === season).map((g) => g.week)),
  ].sort((a, b) => a - b)

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h2>Odds board · {weekLabel(weekNum)}</h2>
          <select
            aria-label="Week"
            value={weekNum}
            onChange={(e) => setParams({ season: String(season), week: e.target.value })}
            style={{ width: 'auto' }}
          >
            {Array.from({ length: MAX_WEEK }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {weekLabel(n)}
                {availableWeeks.includes(n) ? ' ·' : ''}
              </option>
            ))}
          </select>
        </div>
        {!week && (
          <div className="banner warn mb">
            {weekLabel(weekNum)} hasn&apos;t been created yet, so picks can&apos;t be saved to it.{' '}
            <button type="button" className="small primary" onClick={() => void ensureWeek()}>
              Create {weekLabel(weekNum)}
            </button>
          </div>
        )}
        <p className="muted small">
          Lines are the consensus number with the best price across US books
          {lastFetched ? `, last pulled ${formatDateTime(lastFetched)}` : ''}. Tap a line to use it
          as your leg. Odds move, so double-check at your book before locking in.
        </p>
        {error && <div className="banner error">{error}</div>}
        {loading && <div className="loading">Loading lines…</div>}
        {!loading && !weekGames.length && (
          <div className="banner">
            No games loaded for this week. Odds come from the scheduled fetch described in the
            README, or you can simply type your pick and odds in by hand from the{' '}
            <Link to={week ? `/parlay/weeks/${season}/${weekNum}` : '/parlay/weeks'}>
              week page
            </Link>
            .
          </div>
        )}
        {!loading &&
          board.map(({ game: g, markets }) => (
            <div className="game" key={g.id}>
              <div className="game-title">
                <span>
                  {g.away_team} @ {g.home_team}
                </span>
                <span className="muted small">{formatDateTime(g.commence_time)}</span>
              </div>
              <div className="markets">
                {MARKETS.map(([m, label]) => (
                  <div className="market" key={m}>
                    <div className="mk">{label}</div>
                    {markets[m].length === 0 && <span className="muted small">—</span>}
                    {markets[m].map((line) => (
                      <button
                        type="button"
                        key={line.outcome}
                        disabled={!week || line.price === null}
                        onClick={() => choose(g, m, line)}
                      >
                        <span>
                          {line.outcome}
                          {m !== 'h2h' ? ` ${formatPoint(line.point, m)}` : ''}
                        </span>
                        <span className={`odds ${(line.price ?? 0) > 0 ? 'plus' : ''}`}>
                          {formatAmerican(line.price)}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
