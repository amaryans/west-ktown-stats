import { useMemo, useState } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { teamById } from '../../features/analytics/common.ts'
import {
  powerRankings,
  RECENT_WEEKS,
  type PowerFormula,
  type PowerRow,
} from '../../features/analytics/power.ts'
import { fmtPts, recordSortValue } from '../../features/standings/SeasonTable.tsx'
import { formatRecord } from '../../features/standings/standings.ts'
import type { AnalyticsProps } from './AnalyticsPage.tsx'
import { Explainer, fmt1, fmtPct, SeasonPicker, TeamCell } from './shared.tsx'

export default function PowerRankings({
  seasons,
  season,
  setScope,
  meOwnerId,
  keep,
}: AnalyticsProps) {
  const [formula, setFormula] = useState<PowerFormula>('balanced')
  const [asOf, setAsOf] = useState<{ leagueId: string; week: number } | null>(null)
  const week = asOf?.leagueId === season.leagueId ? asOf.week : Infinity
  const { weeks: allWeeks } = useMemo(() => powerRankings(season, formula), [season, formula])
  const { rows } = useMemo(() => powerRankings(season, formula, week), [season, formula, week])
  const teams = useMemo(() => teamById(season), [season])
  const shownWeek = Number.isFinite(week) ? week : allWeeks[allWeeks.length - 1]

  const columns = useMemo<SortColumn<PowerRow>[]>(
    () => [
      { key: 'rank', label: '#', get: (r) => r.rank, defaultDir: 'asc', className: 'num' },
      { key: 'move', label: '±', get: (r) => movement(r), className: 'num' },
      { key: 'team', label: 'Team', get: (r) => teams.get(r.rosterId)?.teamName ?? '' },
      { key: 'score', label: 'Power', get: (r) => r.score, className: 'num' },
      { key: 'record', label: 'Record', get: (r) => recordSortValue(r.record), className: 'num' },
      { key: 'allplay', label: 'All-play', get: (r) => r.allPlayPct, className: 'num' },
      { key: 'recent', label: `Last ${RECENT_WEEKS}`, get: (r) => r.recentPct, className: 'num' },
      { key: 'avg', label: 'Avg', get: (r) => r.avg, className: 'num' },
      { key: 'high', label: 'High', get: (r) => r.high, className: 'num' },
      { key: 'low', label: 'Low', get: (r) => r.low, className: 'num' },
    ],
    [teams],
  )
  const shown = useMemo(
    () => rows.filter((r) => keep(teams.get(r.rosterId)?.ownerId)),
    [rows, teams, keep],
  )
  const { sort, toggle, sorted } = useSortable(shown, columns)

  return (
    <div className="card">
      <div className="card-header">
        <h2>Power rankings</h2>
        <div className="row">
          <SeasonPicker
            seasons={seasons}
            value={season.leagueId}
            onChange={(v) => {
              setScope(v)
              setAsOf(null)
            }}
          />
          {allWeeks.length > 1 && (
            <label className="picker">
              <span className="muted">After week</span>
              <select
                aria-label="After week"
                value={shownWeek}
                onChange={(e) =>
                  setAsOf({ leagueId: season.leagueId, week: Number(e.target.value) })
                }
              >
                {allWeeks.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="picker">
            <span className="muted">Formula</span>
            <select
              aria-label="Formula"
              value={formula}
              onChange={(e) => setFormula(e.target.value as PowerFormula)}
            >
              <option value="balanced">Balanced</option>
              <option value="classic">Classic (Oberon)</option>
            </select>
          </label>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="empty">No games played yet this season.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <SortableTh key={c.key} column={c} sort={sort} onToggle={toggle} />
                ))}
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const team = teams.get(r.rosterId)
                return (
                  <tr key={r.rosterId} className={team?.ownerId === meOwnerId ? 'me' : undefined}>
                    <td className="num">{r.rank}</td>
                    <td className="num nowrap">
                      <Movement row={r} />
                    </td>
                    <td>{team && <TeamCell team={team} />}</td>
                    <td className="num">
                      <strong>{fmt1(r.score)}</strong>
                    </td>
                    <td className="num nowrap">{formatRecord(r.record)}</td>
                    <td className="num">{fmtPct(r.allPlayPct)}</td>
                    <td className="num">{fmtPct(r.recentPct)}</td>
                    <td className="num">{fmtPts(r.avg)}</td>
                    <td className="num">{fmtPts(r.high)}</td>
                    <td className="num">{fmtPts(r.low)}</td>
                    <td>
                      <Sparkline ranks={r.trend} teams={rows.length} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Explainer>
        {formula === 'balanced' ? (
          <>
            <strong>Balanced</strong> (0–100): 50% all-play win % (how often you&apos;d have beaten
            each other team, every week), 30% your actual win % and 20% all-play win % over your
            last {RECENT_WEEKS} games.
          </>
        ) : (
          <>
            <strong>Classic</strong>: the long-running &quot;Oberon Mt.&quot; rating, (average score
            × 6 + (high + low) × 2 + win % × 400) ÷ 10. It leans heavily on points.
          </>
        )}{' '}
        {season.medianEnabled && 'Win % includes games vs. the median. '}± is the move since the
        previous week; the trend line shows rank after each week (higher is better).
      </Explainer>
    </div>
  )
}

function movement(r: PowerRow): number | null {
  return r.prevRank === null ? null : r.prevRank - r.rank
}

function Movement({ row }: { row: PowerRow }) {
  const m = movement(row)
  if (m === null || m === 0) return <span className="muted">–</span>
  return m > 0 ? (
    <span className="success" aria-label={`up ${m}`}>
      ▲{m}
    </span>
  ) : (
    <span className="error" aria-label={`down ${-m}`}>
      ▼{-m}
    </span>
  )
}

function Sparkline({ ranks, teams }: { ranks: number[]; teams: number }) {
  if (ranks.length < 2 || teams < 2) return null
  const w = 72
  const h = 20
  const x = (i: number) => (i / (ranks.length - 1)) * (w - 4) + 2
  const y = (r: number) => ((r - 1) / (teams - 1)) * (h - 4) + 2
  const points = ranks.map((r, i) => `${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(' ')
  const last = ranks[ranks.length - 1] as number
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`Rank by week: ${ranks.join(', ')}`}
    >
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx={x(ranks.length - 1)} cy={y(last)} r="2.5" fill="var(--accent)" />
    </svg>
  )
}
