import { useMemo, useState } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../../components/sortable.tsx'
import type { Week } from '../../../lib/db.ts'
import { Link } from 'react-router-dom'
import { errorMessage, useLeague } from '../../../context/LeagueContext.tsx'
import { useParlay } from '../ParlayContext.tsx'
import { formatAmerican, formatMoney, parlayOdds } from '../lib/odds.ts'
import { currentNflWeek, defaultLockAt, MAX_WEEK, weekLabel } from '../lib/week.ts'
import { ResultBadge } from '../components/Badges.tsx'

export default function Weeks() {
  const { settings, nameOf } = useLeague()
  const { weeks, legsForWeek, createWeek } = useParlay()
  const currentSeason = settings?.season ?? new Date().getFullYear()
  const [season, setSeason] = useState(String(currentSeason))
  const [weekNum, setWeekNum] = useState(() => {
    const cur = currentNflWeek(settings?.season_start)
    const taken = new Set(weeks.filter((w) => w.season === currentSeason).map((w) => w.week))
    let n = cur
    while (taken.has(n) && n < MAX_WEEK) n += 1
    return String(n)
  })
  const [error, setError] = useState<string | null>(null)
  const columns = useMemo<SortColumn<Week>[]>(
    () => [
      { key: 'week', label: 'Week', get: (w) => w.season * 100 + w.week, defaultDir: 'desc' },
      { key: 'placer', label: 'Placed by', get: (w) => (w.loser_id ? nameOf(w.loser_id) : null) },
      { key: 'legs', label: 'Legs', get: (w) => legsForWeek(w.id).length, className: 'num' },
      {
        key: 'odds',
        label: 'Odds',
        get: (w) => parlayOdds(legsForWeek(w.id)).decimal,
        className: 'num',
      },
      { key: 'stake', label: 'Stake', get: (w) => Number(w.stake), className: 'num' },
      { key: 'result', label: 'Result', get: (w) => w.parlay_result },
    ],
    [nameOf, legsForWeek],
  )
  const { sort, toggle, sorted } = useSortable(weeks, columns)

  async function create() {
    setError(null)
    try {
      await createWeek({
        season: Number(season),
        week: Number(weekNum),
        stake: settings?.default_stake ?? 5,
        lock_at:
          Number(season) === currentSeason && settings?.season_start
            ? defaultLockAt(settings.season_start, Number(weekNum)).toISOString()
            : null,
      })
    } catch (err) {
      const msg = errorMessage(err)
      setError(
        msg.includes('duplicate') || msg.includes('23505') ? 'That week already exists.' : msg,
      )
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h2>Weeks</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <SortableTh key={c.key} column={c} sort={sort} onToggle={toggle} />
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No weeks yet. Create the first one below.
                  </td>
                </tr>
              )}
              {sorted.map((w) => {
                const legs = legsForWeek(w.id)
                const { american } = parlayOdds(legs)
                return (
                  <tr key={w.id}>
                    <td className="nowrap">
                      <Link to={`/parlay/weeks/${w.season}/${w.week}`}>{weekLabel(w.week)}</Link>{' '}
                      <span className="muted small">{w.season}</span>
                    </td>
                    <td>{w.loser_id ? nameOf(w.loser_id) : <span className="muted">—</span>}</td>
                    <td className="num">{legs.length}</td>
                    <td className="num">{formatAmerican(american)}</td>
                    <td className="num">{formatMoney(w.stake)}</td>
                    <td>
                      <ResultBadge result={w.parlay_result} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Add a week</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="w-season">Season</label>
            <input
              id="w-season"
              type="number"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="w-week">NFL week</label>
            <input
              id="w-week"
              type="number"
              min={1}
              max={MAX_WEEK}
              value={weekNum}
              onChange={(e) => setWeekNum(e.target.value)}
            />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="primary" onClick={() => void create()}>
              Create {weekLabel(Number(weekNum))}
            </button>
          </div>
        </div>
        {error && <div className="error small mt">{error}</div>}
      </div>
    </div>
  )
}
