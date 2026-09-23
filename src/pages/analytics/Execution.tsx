import { useMemo } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { teamById } from '../../features/analytics/common.ts'
import {
  rosterWeeks,
  summarise,
  type Benching,
  type ExecutionLine,
  type RosterWeek,
} from '../../features/analytics/execution.ts'
import { fmtPts } from '../../features/standings/SeasonTable.tsx'
import type { SeasonTeam } from '../../features/standings/standings.ts'
import type { AnalyticsProps } from './AnalyticsPage.tsx'
import { ALL, Explainer, fmtPct, latestTeam, SeasonPicker, TeamCell } from './shared.tsx'
import { useLineupData, type LineupData } from './useLineupData.ts'

interface Row extends ExecutionLine {
  key: string
  team: SeasonTeam | undefined
  sub?: string
  /** Season of the worst week, for all-time rows. */
  worstSeason: string | null
}

interface SeasonBenching extends Benching {
  season: string
  team: SeasonTeam | undefined
  lostGame: boolean
}

export default function Execution(props: AnalyticsProps) {
  const lineups = useLineupData(props.history)
  if (lineups.error) {
    return <div className="banner error">Could not load lineups from Sleeper: {lineups.error}</div>
  }
  if (!lineups.data) return <div className="loading">{lineups.progress ?? 'Loading…'}</div>
  return <ExecutionView {...props} data={lineups.data} />
}

function ExecutionView({
  history,
  seasons,
  scope,
  setScope,
  season,
  meOwnerId,
  data,
}: AnalyticsProps & { data: LineupData }) {
  const all = scope === ALL

  // Every roster-week for the seasons in scope, tagged with its season's standings.
  const scoped = useMemo(() => {
    const wanted = all ? seasons : [season]
    return wanted.flatMap((s) => {
      const lineup = data.seasons.find((l) => l.leagueId === s.leagueId)
      if (!lineup || lineup.rosterPositions.length === 0) return []
      const weeks = rosterWeeks({ ...lineup, ...data })
      return [{ standings: s, weeks, teams: teamById(s) }]
    })
  }, [all, seasons, season, data])

  const rows = useMemo<Row[]>(() => {
    type Group = {
      weeks: RosterWeek[]
      seasonOf: Map<RosterWeek, string>
      team: SeasonTeam | undefined
    }
    const groups = new Map<string, Group>()
    for (const { standings, weeks, teams } of scoped) {
      for (const w of weeks) {
        const team = teams.get(w.rosterId)
        const key = all
          ? (team?.ownerId ?? `${standings.season}:${w.rosterId}`)
          : String(w.rosterId)
        const g: Group = groups.get(key) ?? { weeks: [], seasonOf: new Map(), team }
        g.weeks.push(w)
        g.seasonOf.set(w, standings.season)
        groups.set(key, g)
      }
    }
    return [...groups].map(([key, g]) => {
      const line = summarise(g.weeks)
      const team = all && g.team?.ownerId ? latestTeam(history, g.team.ownerId) : g.team
      return {
        ...line,
        key,
        team,
        sub: all ? team?.ownerName : undefined,
        worstSeason: line.worstWeek ? (g.seasonOf.get(line.worstWeek) ?? null) : null,
      }
    })
  }, [scoped, all, history])

  const benchings = useMemo<SeasonBenching[]>(
    () =>
      scoped
        .flatMap(({ standings, weeks, teams }) =>
          weeks.flatMap((w) =>
            w.benchings.map((b) => ({
              ...b,
              season: standings.season,
              team: teams.get(b.rosterId),
              lostGame:
                w.lineupLoss && w.opponentActual !== null && w.actual + b.cost > w.opponentActual,
            })),
          ),
        )
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10),
    [scoped],
  )

  const columns = useMemo<SortColumn<Row>[]>(
    () => [
      { key: 'team', label: 'Team', get: (r) => r.team?.teamName ?? '' },
      { key: 'eff', label: 'Execution', get: (r) => r.efficiency, className: 'num' },
      { key: 'actual', label: 'Scored', get: (r) => r.actual, className: 'num' },
      { key: 'optimal', label: 'Best possible', get: (r) => r.optimal, className: 'num' },
      {
        key: 'left',
        label: 'Left on bench',
        get: (r) => r.left,
        defaultDir: 'asc',
        className: 'num',
      },
      {
        key: 'perweek',
        label: 'Per week',
        get: (r) => (r.weeks ? r.left / r.weeks : null),
        defaultDir: 'asc',
        className: 'num',
      },
      { key: 'perfect', label: 'Perfect wks', get: (r) => r.perfectWeeks, className: 'num' },
      {
        key: 'losses',
        label: 'Lineup losses',
        get: (r) => r.lineupLosses,
        defaultDir: 'asc',
        className: 'num',
      },
      {
        key: 'empty',
        label: 'Empty slots',
        get: (r) => r.emptySlots,
        defaultDir: 'asc',
        className: 'num',
      },
      {
        key: 'worst',
        label: 'Worst week',
        get: (r) => r.worstWeek?.left ?? null,
        className: 'num',
      },
    ],
    [],
  )
  const { sort, toggle, sorted } = useSortable(rows, columns, { key: 'eff', dir: 'desc' })

  const played = rows.filter((r) => r.efficiency !== null)
  const best = played.reduce<Row | null>(
    (b, r) => (!b || (r.efficiency ?? 0) > (b.efficiency ?? 0) ? r : b),
    null,
  )
  const mostLeft = played.reduce<Row | null>((b, r) => (!b || r.left > b.left ? r : b), null)
  const mostLosses = played.reduce<Row | null>(
    (b, r) => (!b || r.lineupLosses > b.lineupLosses ? r : b),
    null,
  )

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Execution score</h2>
          <SeasonPicker seasons={seasons} value={scope} onChange={setScope} allowAll />
        </div>
        {scoped.length === 0 ? (
          <p className="empty">No lineup data for this season on Sleeper.</p>
        ) : (
          <>
            {best && mostLeft && mostLosses && (
              <div className="stat-tiles mb">
                <div className="tile">
                  <div className="label">Coach of the year</div>
                  <div className="value text">{best.team?.teamName ?? '—'}</div>
                  <div className="sub">{fmtPct(best.efficiency)} of the best possible</div>
                </div>
                <div className="tile">
                  <div className="label">Most left on the bench</div>
                  <div className="value text">{mostLeft.team?.teamName ?? '—'}</div>
                  <div className="sub">{fmtPts(mostLeft.left)} points</div>
                </div>
                <div className="tile">
                  <div className="label">Most lineup losses</div>
                  <div className="value text">
                    {mostLosses.lineupLosses ? (mostLosses.team?.teamName ?? '—') : 'Nobody'}
                  </div>
                  <div className="sub">
                    {mostLosses.lineupLosses} game{mostLosses.lineupLosses === 1 ? '' : 's'} a
                    better lineup would have won
                  </div>
                </div>
              </div>
            )}
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
                      <td className="num">
                        <strong>{fmtPct(r.efficiency)}</strong>
                      </td>
                      <td className="num">{fmtPts(r.actual)}</td>
                      <td className="num">{fmtPts(r.optimal)}</td>
                      <td className="num">{fmtPts(r.left)}</td>
                      <td className="num">{r.weeks ? fmtPts(r.left / r.weeks) : '—'}</td>
                      <td className="num">{r.perfectWeeks}</td>
                      <td className={`num${r.lineupLosses ? ' error' : ''}`}>{r.lineupLosses}</td>
                      <td className="num">{r.emptySlots || <span className="muted">0</span>}</td>
                      <td className="num nowrap">
                        {r.worstWeek ? (
                          <>
                            {fmtPts(r.worstWeek.left)}{' '}
                            <span className="muted small">
                              {all && r.worstSeason ? `${r.worstSeason} ` : ''}wk {r.worstWeek.week}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Explainer>
          <strong>Execution</strong> is points scored ÷ the most the roster could have scored that
          week with hindsight: the best legal lineup from everyone rostered, filled slot by slot
          (flex spots included). <strong>Lineup losses</strong> are losses or ties the best lineup
          would have won against the opponent&apos;s actual score. <strong>Empty slots</strong>{' '}
          count starting spots left blank. Regular season only.
        </Explainer>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Worst benchings</h2>
          <span className="muted small">{all ? 'All seasons' : season.season}</span>
        </div>
        {benchings.length === 0 ? (
          <p className="empty">Nobody has benched a better player yet.</p>
        ) : (
          <ol className="record-list">
            {benchings.map((b) => (
              <li key={`${b.season}-${b.week}-${b.rosterId}-${b.benched.playerId}`}>
                <strong className="num">−{fmtPts(b.cost)}</strong> {b.team?.teamName ?? '?'} benched{' '}
                <strong>{data.name(b.benched.playerId)}</strong> ({fmtPts(b.benched.points)}){' '}
                {b.started ? (
                  <>
                    for {data.name(b.started.playerId)} ({fmtPts(b.started.points)})
                  </>
                ) : (
                  'and left the slot empty'
                )}
                <span className="muted small">
                  {' '}
                  · {b.season} wk {b.week}
                </span>
                {b.lostGame && <span className="badge bad"> cost the game</span>}
              </li>
            ))}
          </ol>
        )}
        <Explainer>
          Each benched player who belonged in the best lineup is paired with the lowest-scoring
          starter (or empty slot) in a spot that player could have filled.
        </Explainer>
      </div>
    </>
  )
}
