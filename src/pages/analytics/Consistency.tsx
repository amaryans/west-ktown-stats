import { useMemo } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { teamById } from '../../features/analytics/common.ts'
import {
  careerConsistency,
  CLOSE_MARGIN,
  seasonConsistency,
  type ConsistencyLine,
} from '../../features/analytics/consistency.ts'
import { fmtPts, recordSortValue } from '../../features/standings/SeasonTable.tsx'
import { formatRecord, type SeasonTeam } from '../../features/standings/standings.ts'
import type { AnalyticsProps } from './AnalyticsPage.tsx'
import { ALL, Explainer, fmt2, fmtPct, latestTeam, SeasonPicker, TeamCell } from './shared.tsx'

interface Row extends ConsistencyLine {
  key: string
  team: SeasonTeam | undefined
  sub?: string
}

const pts = (n: number | null) => (n === null ? '—' : fmtPts(n))

export default function Consistency(props: AnalyticsProps) {
  const { history, seasons, scope, setScope, season, meOwnerId } = props
  const all = scope === ALL

  const rows = useMemo<Row[]>(() => {
    if (all) {
      return careerConsistency(history).map((r) => ({
        ...r,
        key: r.ownerId,
        team: latestTeam(history, r.ownerId),
        sub: r.ownerName,
      }))
    }
    const teams = teamById(season)
    return seasonConsistency(season).map((r) => ({
      ...r,
      key: String(r.rosterId),
      team: teams.get(r.rosterId),
    }))
  }, [all, history, season])

  const columns = useMemo<SortColumn<Row>[]>(
    () => [
      { key: 'team', label: 'Team', get: (r) => r.team?.teamName ?? '' },
      { key: 'avg', label: 'Avg', get: (r) => r.avg, className: 'num' },
      { key: 'sd', label: 'Std dev', get: (r) => r.sd, defaultDir: 'asc', className: 'num' },
      { key: 'floor', label: 'Floor', get: (r) => r.floor, className: 'num' },
      { key: 'ceiling', label: 'Ceiling', get: (r) => r.ceiling, className: 'num' },
      { key: 'booms', label: 'Booms', get: (r) => r.booms, className: 'num' },
      { key: 'busts', label: 'Busts', get: (r) => r.busts, className: 'num' },
      { key: 'above', label: '> Median', get: (r) => r.aboveMedianPct, className: 'num' },
      {
        key: 'close',
        label: 'Close games',
        get: (r) => recordSortValue(r.close),
        className: 'num',
      },
      { key: 'mov', label: 'Avg win by', get: (r) => r.avgWinMargin, className: 'num' },
      { key: 'mol', label: 'Avg loss by', get: (r) => r.avgLossMargin, className: 'num' },
      { key: 'bestloss', label: 'Best loss', get: (r) => r.bestLoss, className: 'num' },
      {
        key: 'worstwin',
        label: 'Worst win',
        get: (r) => r.worstWin,
        defaultDir: 'asc',
        className: 'num',
      },
    ],
    [],
  )
  const { sort, toggle, sorted } = useSortable(rows, columns, { key: 'sd', dir: 'asc' })

  return (
    <div className="card">
      <div className="card-header">
        <h2>Consistency &amp; close games</h2>
        <SeasonPicker seasons={seasons} value={scope} onChange={setScope} allowAll />
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
            {sorted.map((r) => (
              <tr key={r.key} className={r.team?.ownerId === meOwnerId ? 'me' : undefined}>
                <td>{r.team && <TeamCell team={r.team} sub={r.sub} />}</td>
                <td className="num">{pts(r.avg)}</td>
                <td className="num">{fmt2(r.sd)}</td>
                <td className="num">{pts(r.floor)}</td>
                <td className="num">{pts(r.ceiling)}</td>
                <td className="num success">{r.booms}</td>
                <td className="num error">{r.busts}</td>
                <td className="num">{fmtPct(r.aboveMedianPct)}</td>
                <td className="num nowrap">
                  {r.close.wins + r.close.losses + r.close.ties ? formatRecord(r.close) : '—'}
                </td>
                <td className="num">{pts(r.avgWinMargin)}</td>
                <td className="num">{pts(r.avgLossMargin)}</td>
                <td className="num">{pts(r.bestLoss)}</td>
                <td className="num">{pts(r.worstWin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explainer>
        <strong>Std dev</strong> measures how much a team&apos;s score swings week to week (lower is
        steadier). A <strong>boom</strong> is a score at least one standard deviation above the
        league&apos;s average that season; a <strong>bust</strong> is one at least that far below.{' '}
        <strong>&gt; Median</strong> is the share of weeks above the league median.{' '}
        <strong>Close games</strong> were decided by less than {CLOSE_MARGIN} points.
      </Explainer>
    </div>
  )
}
