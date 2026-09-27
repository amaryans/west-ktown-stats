import { useMemo, useState } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { rivalries, type Ledger } from '../../features/analytics/rivalry.ts'
import { fmtPts, recordSortValue } from '../../features/standings/SeasonTable.tsx'
import { formatRecord, winPct } from '../../features/standings/standings.ts'
import type { AnalyticsProps } from './AnalyticsPage.tsx'
import { Explainer, fmtPct, heat, latestTeam, signClass, TeamCell } from './shared.tsx'

export default function Rivalries({ history, meOwnerId, keep }: AnalyticsProps) {
  const data = useMemo(() => rivalries(history), [history])
  const owners = useMemo(() => data.owners.filter((o) => keep(o.ownerId)), [data, keep])
  const [picked, setPicked] = useState<string | null>(null)
  const selected =
    picked ??
    (meOwnerId && owners.some((o) => o.ownerId === meOwnerId) ? meOwnerId : null) ??
    owners[0]?.ownerId ??
    null

  const ledgers = useMemo(
    () => data.all.filter((l) => l.ownerId === selected && keep(l.opponentId)),
    [data, selected, keep],
  )
  const names = useMemo(() => new Map(data.owners.map((o) => [o.ownerId, o.ownerName])), [data])

  const columns = useMemo<SortColumn<Ledger>[]>(
    () => [
      { key: 'opp', label: 'Opponent', get: (l) => names.get(l.opponentId) ?? '' },
      { key: 'record', label: 'Record', get: (l) => recordSortValue(l.record), className: 'num' },
      { key: 'pct', label: 'Win %', get: (l) => winPct(l.record), className: 'num' },
      { key: 'games', label: 'Games', get: (l) => l.games, className: 'num' },
      { key: 'pf', label: 'PF', get: (l) => l.pointsFor, className: 'num' },
      { key: 'pa', label: 'PA', get: (l) => l.pointsAgainst, className: 'num' },
      {
        key: 'diff',
        label: 'Avg margin',
        get: (l) => (l.pointsFor - l.pointsAgainst) / l.games,
        className: 'num',
      },
      { key: 'last', label: 'Last met', get: (l) => lastKey(l) },
    ],
    [names],
  )
  const { sort, toggle, sorted } = useSortable(ledgers, columns, { key: 'pct', dir: 'desc' })

  if (owners.length < 2) {
    return <div className="card empty">Not enough head-to-head games yet.</div>
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Head-to-head grid</h2>
          <span className="muted small">All seasons · row manager&apos;s record vs. column</span>
        </div>
        <div className="table-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>Manager</th>
                {owners.map((o) => (
                  <th key={o.ownerId} className="num matrix__col" title={o.ownerName}>
                    {o.ownerName.slice(0, 5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {owners.map((a) => (
                <tr key={a.ownerId} className={a.ownerId === meOwnerId ? 'me' : undefined}>
                  <td>
                    <button type="button" className="link" onClick={() => setPicked(a.ownerId)}>
                      {a.ownerName}
                    </button>
                  </td>
                  {owners.map((b) => {
                    if (a.ownerId === b.ownerId)
                      return <td key={b.ownerId} className="matrix__self" />
                    const l = data.ledger(a.ownerId, b.ownerId)
                    if (!l)
                      return (
                        <td key={b.ownerId} className="num muted">
                          —
                        </td>
                      )
                    return (
                      <td
                        key={b.ownerId}
                        className="num nowrap"
                        style={heat((winPct(l.record) - 0.5) * 2)}
                        title={`${a.ownerName} vs ${b.ownerName}: ${formatRecord(l.record)}`}
                      >
                        {formatRecord(l.record)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Explainer>
          Regular-season games only, matched across seasons by Sleeper account. Click a name to see
          that manager&apos;s full ledger below.
        </Explainer>
      </div>

      {selected && (
        <div className="card">
          <div className="card-header">
            <h2>Ledger</h2>
            <label className="picker">
              <span className="muted">Manager</span>
              <select
                aria-label="Manager"
                value={selected}
                onChange={(e) => setPicked(e.target.value)}
              >
                {owners.map((o) => (
                  <option key={o.ownerId} value={o.ownerId}>
                    {o.ownerName}
                  </option>
                ))}
              </select>
            </label>
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
                {sorted.map((l) => {
                  const team = latestTeam(history, l.opponentId)
                  const margin = (l.pointsFor - l.pointsAgainst) / l.games
                  return (
                    <tr key={l.opponentId}>
                      <td>{team && <TeamCell team={team} sub={names.get(l.opponentId)} />}</td>
                      <td className="num nowrap">{formatRecord(l.record)}</td>
                      <td className="num">{fmtPct(winPct(l.record))}</td>
                      <td className="num">{l.games}</td>
                      <td className="num">{fmtPts(l.pointsFor)}</td>
                      <td className="num">{fmtPts(l.pointsAgainst)}</td>
                      <td className={`num ${signClass(margin)}`}>
                        {margin > 0 ? '+' : ''}
                        {fmtPts(margin)}
                      </td>
                      <td className="nowrap">
                        {l.last ? (
                          <>
                            {l.last.season} wk {l.last.week}{' '}
                            <span className="muted small">
                              {fmtPts(l.last.points)}–{fmtPts(l.last.opponentPoints)}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function lastKey(l: Ledger): string {
  return l.last ? `${l.last.season}-${String(l.last.week).padStart(2, '0')}` : ''
}
