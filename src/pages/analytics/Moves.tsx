import { useMemo } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { teamById } from '../../features/analytics/common.ts'
import type { SeasonReport } from '../../features/analytics/seasonReport.ts'
import { EVEN_MARGIN, type Pickup, type TradeGrade } from '../../features/analytics/transactions.ts'
import { fmtPts } from '../../features/standings/SeasonTable.tsx'
import type { SeasonTeam } from '../../features/standings/standings.ts'
import type { AnalyticsProps } from './AnalyticsPage.tsx'
import { useReports } from './reports.ts'
import { ALL, Explainer, latestTeam, SeasonPicker, signClass, TeamCell } from './shared.tsx'
import { useMovesData, type MovesData } from './useLineupData.ts'

interface Row {
  key: string
  team: SeasonTeam | undefined
  sub?: string
  trades: number
  tradesWon: number
  tradesLost: number
  tradeNet: number
  pickups: number
  pickupPoints: number
  faabSpent: number
  best: (Pickup & { season: string }) | null
}

export default function Moves(props: AnalyticsProps) {
  const moves = useMovesData(props.history)
  if (moves.error) {
    return (
      <div className="banner error">Could not load transactions from Sleeper: {moves.error}</div>
    )
  }
  if (!moves.data) return <div className="loading">{moves.progress ?? 'Loading…'}</div>
  return <MovesView {...props} data={moves.data} />
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${fmtPts(n)}`

function MovesView({
  history,
  seasons,
  scope,
  setScope,
  season,
  meOwnerId,
  keep,
  data,
}: AnalyticsProps & { data: MovesData }) {
  const all = scope === ALL
  const reports = useReports(data, seasons)
  const scoped = useMemo(
    () =>
      (all ? seasons : [season])
        .map((s) => reports.get(s.leagueId))
        .filter((r): r is SeasonReport => r !== undefined),
    [all, seasons, season, reports],
  )

  const rows = useMemo<Row[]>(() => {
    const out = new Map<string, Row>()
    for (const report of scoped) {
      const teams = teamById(report.standings)
      for (const m of report.moves.values()) {
        const team = teams.get(m.rosterId)
        const key = all
          ? (team?.ownerId ?? `${report.standings.season}:${m.rosterId}`)
          : String(m.rosterId)
        const row = out.get(key) ?? {
          key,
          team: all && team?.ownerId ? latestTeam(history, team.ownerId) : team,
          sub: all ? team?.ownerName : undefined,
          trades: 0,
          tradesWon: 0,
          tradesLost: 0,
          tradeNet: 0,
          pickups: 0,
          pickupPoints: 0,
          faabSpent: 0,
          best: null,
        }
        row.trades += m.trades
        row.tradesWon += m.tradesWon
        row.tradesLost += m.tradesLost
        row.tradeNet = Math.round((row.tradeNet + m.tradeNet) * 100) / 100
        row.pickups += m.pickups
        row.pickupPoints = Math.round((row.pickupPoints + m.pickupPoints) * 100) / 100
        row.faabSpent += m.faabSpent
        if (m.bestPickup && (!row.best || m.bestPickup.starterPoints > row.best.starterPoints)) {
          row.best = { ...m.bestPickup, season: report.standings.season }
        }
        out.set(key, row)
      }
    }
    return [...out.values()]
  }, [scoped, all, history])

  const anyFaab = rows.some((r) => r.faabSpent > 0)
  const columns = useMemo<SortColumn<Row>[]>(
    () => [
      { key: 'team', label: 'Team', get: (r) => r.team?.teamName ?? '' },
      { key: 'trades', label: 'Trades', get: (r) => r.trades, className: 'num' },
      { key: 'wl', label: 'Won–lost', get: (r) => r.tradesWon - r.tradesLost, className: 'num' },
      { key: 'net', label: 'Trade net', get: (r) => r.tradeNet, className: 'num' },
      { key: 'pickups', label: 'Pickups', get: (r) => r.pickups, className: 'num' },
      { key: 'pts', label: 'Pickup pts', get: (r) => r.pickupPoints, className: 'num' },
      ...(anyFaab
        ? [
            { key: 'faab', label: 'FAAB spent', get: (r: Row) => r.faabSpent, className: 'num' },
            {
              key: 'ppd',
              label: 'Pts per $',
              get: (r: Row) => (r.faabSpent > 0 ? r.pickupPoints / r.faabSpent : null),
              className: 'num',
            },
          ]
        : []),
      {
        key: 'best',
        label: 'Best pickup',
        get: (r) => r.best?.starterPoints ?? null,
        className: 'num',
      },
    ],
    [anyFaab],
  )
  const shown = useMemo(() => rows.filter((r) => keep(r.team?.ownerId)), [rows, keep])
  const { sort, toggle, sorted } = useSortable(shown, columns, { key: 'pts', dir: 'desc' })

  const trades = useMemo(
    () =>
      scoped
        .flatMap((r) => {
          const teams = teamById(r.standings)
          // A trade shows when any side is an active member.
          return r.trades
            .filter((t) => t.sides.some((s) => keep(teams.get(s.rosterId)?.ownerId)))
            .map((t) => ({ trade: t, report: r }))
        })
        .sort((a, b) =>
          all
            ? b.trade.margin - a.trade.margin
            : b.trade.week - a.trade.week || b.trade.margin - a.trade.margin,
        )
        .slice(0, all ? 10 : undefined),
    [scoped, all, keep],
  )
  const topPickups = useMemo(
    () =>
      scoped
        .flatMap((r) => {
          const teams = teamById(r.standings)
          return r.pickups
            .filter((p) => keep(teams.get(p.rosterId)?.ownerId))
            .map((p) => ({ pickup: p, report: r }))
        })
        .sort((a, b) => b.pickup.starterPoints - a.pickup.starterPoints)
        .slice(0, 10),
    [scoped, keep],
  )

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Trades &amp; waivers</h2>
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
                  <td className="num">{r.trades}</td>
                  <td className="num nowrap">
                    {r.trades ? `${r.tradesWon}–${r.tradesLost}` : <span className="muted">—</span>}
                  </td>
                  <td className={`num ${signClass(r.tradeNet)}`}>
                    {r.trades ? signed(r.tradeNet) : <span className="muted">—</span>}
                  </td>
                  <td className="num">{r.pickups}</td>
                  <td className="num">{fmtPts(r.pickupPoints)}</td>
                  {anyFaab && (
                    <>
                      <td className="num">${r.faabSpent}</td>
                      <td className="num">
                        {r.faabSpent > 0 ? (r.pickupPoints / r.faabSpent).toFixed(1) : '—'}
                      </td>
                    </>
                  )}
                  <td className="nowrap">
                    {r.best ? (
                      <>
                        {data.name(r.best.playerId)}{' '}
                        <span className="muted small">
                          {fmtPts(r.best.starterPoints)}
                          {all ? ` · ${r.best.season}` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Explainer>
          Everything is measured in <strong>starter points</strong>: what a player scored while in
          your lineup after you got him, regular season only. <strong>Trade net</strong> is starter
          points from the players you received minus what the players you sent scored for their new
          teams. A trade within {EVEN_MARGIN} points either way is called even.{' '}
          <strong>Pickup pts</strong> are starter points from waiver and free-agent adds.
        </Explainer>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>{all ? 'Most lopsided trades' : `Trades · ${season.season}`}</h2>
          <span className="muted small">{trades.length} shown</span>
        </div>
        {trades.length === 0 ? (
          <p className="empty">No trades.</p>
        ) : (
          <div className="stack">
            {trades.map(({ trade, report }) => (
              <TradeCard
                key={`${report.standings.leagueId}-${trade.id}`}
                trade={trade}
                report={report}
                data={data}
              />
            ))}
          </div>
        )}
        <Explainer>Draft picks and FAAB that changed hands are listed but not valued.</Explainer>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Best pickups</h2>
          <span className="muted small">{all ? 'All seasons' : season.season}</span>
        </div>
        {topPickups.length === 0 ? (
          <p className="empty">No pickups.</p>
        ) : (
          <ol className="record-list">
            {topPickups.map(({ pickup: p, report }) => (
              <li key={`${report.standings.leagueId}-${p.moveId}-${p.playerId}`}>
                <strong className="num">{fmtPts(p.starterPoints)}</strong> {data.name(p.playerId)}{' '}
                <span className="muted small">
                  → {teamById(report.standings).get(p.rosterId)?.teamName ?? '?'} ·{' '}
                  {p.kind === 'waiver' ? `waivers${p.bid ? ` ($${p.bid})` : ''}` : 'free agent'} ·{' '}
                  {report.standings.season} wk {p.week} · {p.starts} start
                  {p.starts === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}

function TradeCard({
  trade,
  report,
  data,
}: {
  trade: TradeGrade
  report: SeasonReport
  data: MovesData
}) {
  const teams = teamById(report.standings)
  return (
    <div className="trade">
      <div className="row between small">
        <span className="muted">
          {report.standings.season} · week {trade.week}
        </span>
        {trade.winner === null ? (
          <span className="badge">Even</span>
        ) : (
          <span className="badge good">
            {teams.get(trade.winner)?.teamName ?? '?'} by {fmtPts(trade.margin)}
          </span>
        )}
      </div>
      <div className="trade__sides">
        {trade.sides.map((side) => {
          const team = teams.get(side.rosterId)
          return (
            <div key={side.rosterId} className="trade__side">
              {team && <TeamCell team={team} />}
              <ul className="record-list">
                {side.received.map((p) => (
                  <li key={p.playerId}>
                    {data.name(p.playerId)}{' '}
                    <span className="muted small">
                      {fmtPts(p.starterPoints)} in {p.starts} start{p.starts === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
                {side.picksReceived.map((pk) => (
                  <li key={`${pk.season}-${pk.round}-${pk.from}`} className="muted">
                    {pk.season} round {pk.round} pick
                  </li>
                ))}
                {side.faabReceived > 0 && <li className="muted">${side.faabReceived} FAAB</li>}
                {side.received.length === 0 &&
                  side.picksReceived.length === 0 &&
                  side.faabReceived === 0 && <li className="muted">Nothing</li>}
              </ul>
              <div className={`small ${signClass(side.net)}`}>
                Net {signed(side.net)}{' '}
                <span className="muted">
                  ({fmtPts(side.gained)} in, {fmtPts(side.gaveUp)} out)
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
