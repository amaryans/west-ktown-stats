import { useMemo } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { teamById } from '../../features/analytics/common.ts'
import {
  positionalPoints,
  rosterWeeks,
  topContributors,
  type PositionalBreakdown,
} from '../../features/analytics/execution.ts'
import { fmtPts } from '../../features/standings/SeasonTable.tsx'
import type { AnalyticsProps } from './AnalyticsPage.tsx'
import { ALL, Explainer, heat, SeasonPicker, TeamCell } from './shared.tsx'
import { useLineupData, type LineupData } from './useLineupData.ts'

type Row = PositionalBreakdown['rows'][number]

export default function Positions(props: AnalyticsProps) {
  const lineups = useLineupData(props.history)
  if (lineups.error) {
    return <div className="banner error">Could not load lineups from Sleeper: {lineups.error}</div>
  }
  if (!lineups.data) return <div className="loading">{lineups.progress ?? 'Loading…'}</div>
  return <PositionsView {...props} data={lineups.data} />
}

function PositionsView({
  seasons,
  scope,
  setScope,
  season,
  meOwnerId,
  keep,
  data,
}: AnalyticsProps & { data: LineupData }) {
  const teams = useMemo(() => teamById(season), [season])
  const weeks = useMemo(() => {
    const lineup = data.seasons.find((l) => l.leagueId === season.leagueId)
    return lineup ? rosterWeeks({ ...lineup, ...data }) : []
  }, [data, season])
  const breakdown = useMemo(() => positionalPoints(weeks, data.primaryPosition), [weeks, data])
  const mvps = useMemo(() => topContributors(weeks, 3), [weeks])

  const columns = useMemo<SortColumn<Row>[]>(
    () => [
      { key: 'team', label: 'Team', get: (r) => teams.get(r.rosterId)?.teamName ?? '' },
      ...breakdown.positions.map((p) => ({
        key: p,
        label: p,
        get: (r: Row) => r.byPosition[p] ?? 0,
        className: 'num',
      })),
      { key: 'total', label: 'Starters', get: (r) => r.total, className: 'num' },
    ],
    [breakdown.positions, teams],
  )
  const shown = useMemo(
    () => breakdown.rows.filter((r) => keep(teams.get(r.rosterId)?.ownerId)),
    [breakdown.rows, teams, keep],
  )
  const { sort, toggle, sorted } = useSortable(shown, columns, {
    key: 'total',
    dir: 'desc',
  })

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Points by position · {season.season}</h2>
          <SeasonPicker seasons={seasons} value={scope} onChange={setScope} allowAll />
        </div>
        {breakdown.rows.length === 0 ? (
          <p className="empty">No lineup data for this season on Sleeper.</p>
        ) : (
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
                {sorted.map((r) => {
                  const team = teams.get(r.rosterId)
                  return (
                    <tr key={r.rosterId} className={team?.ownerId === meOwnerId ? 'me' : undefined}>
                      <td>{team && <TeamCell team={team} />}</td>
                      {breakdown.positions.map((p) => {
                        const v = r.byPosition[p] ?? 0
                        const avg = breakdown.leagueAverage[p] ?? 0
                        return (
                          <td
                            key={p}
                            className="num"
                            style={avg > 0 ? heat(((v - avg) / avg) * 2.5) : undefined}
                            title={`League average ${fmtPts(avg)}`}
                          >
                            {fmtPts(v)}
                          </td>
                        )
                      })}
                      <td className="num">
                        <strong>{fmtPts(r.total)}</strong>
                      </td>
                    </tr>
                  )
                })}
                <tr className="dim">
                  <td>
                    League average{shown.length < breakdown.rows.length ? ' (all teams)' : ''}
                  </td>
                  {breakdown.positions.map((p) => (
                    <td key={p} className="num">
                      {fmtPts(breakdown.leagueAverage[p] ?? 0)}
                    </td>
                  ))}
                  <td className="num">
                    {fmtPts(
                      breakdown.positions.reduce(
                        (s, p) => s + (breakdown.leagueAverage[p] ?? 0),
                        0,
                      ),
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <Explainer>
          Points scored by starters, grouped by each player&apos;s main position (a flex counts as
          the player&apos;s own position). Green is above the league average at that position, red
          below. {scope === ALL && 'This view shows one season at a time: the newest is shown.'}
        </Explainer>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Team MVPs · {season.season}</h2>
          <span className="muted small">Points while in the starting lineup</span>
        </div>
        <div className="grid">
          {[...mvps]
            .map(([rosterId, top]) => ({ rosterId, top, team: teams.get(rosterId) }))
            .filter(({ team }) => keep(team?.ownerId))
            .sort((a, b) => (b.top[0]?.share ?? 0) - (a.top[0]?.share ?? 0))
            .map(({ rosterId, top, team }) => (
              <div key={rosterId}>
                {team && <TeamCell team={team} />}
                <ol className="record-list mt">
                  {top.map((c) => (
                    <li key={c.playerId}>
                      <strong>{data.name(c.playerId)}</strong>{' '}
                      <span className={`pos ${data.primaryPosition(c.playerId) ?? ''}`}>
                        {data.primaryPosition(c.playerId) ?? '?'}
                      </span>{' '}
                      {fmtPts(c.points)}
                      <span className="muted small">
                        {' '}
                        · {Math.round(c.share * 100)}% of team · {c.starts} start
                        {c.starts === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
        </div>
        <Explainer>Teams are ordered by how much they leaned on their top player.</Explainer>
      </div>
    </>
  )
}
