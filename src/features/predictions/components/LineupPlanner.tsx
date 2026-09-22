import { useMemo, useState } from 'react'
import { forecastKey, type TeamWeekForecast } from '../engine/index.ts'
import { fmt1 } from '../format.ts'
import type { PredictionData } from '../loader.ts'

/**
 * Optimal lineups from the projections: every team's projected best score
 * for each remaining week (bye weeks stand out), and one team's full lineup
 * for a chosen week.
 */
export default function LineupPlanner({
  data,
  defaultOwnerId,
}: {
  data: PredictionData
  defaultOwnerId?: string | null
}) {
  const weeks = [...data.remainingWeeks, ...data.playoffWeeks].filter(
    (w) => !data.missingProjectionWeeks.includes(w),
  )
  const isPlayoffWeek = (w: number) => w > data.lastRegularWeek
  const defaultRoster =
    data.teams.find((t) => t.ownerId && t.ownerId === defaultOwnerId)?.rosterId ??
    data.teams[0]?.rosterId ??
    null
  const [rosterId, setRosterId] = useState<number | null>(defaultRoster)
  const [week, setWeek] = useState<number | null>(weeks[0] ?? null)
  const team = data.teams.find((t) => t.rosterId === rosterId) ?? null
  const forecast =
    rosterId !== null && week !== null ? data.forecasts[forecastKey(rosterId, week)] : undefined

  const grid = useMemo(
    () =>
      data.teams
        .map((t) => ({
          team: t,
          cells: weeks.map((w) => data.forecasts[forecastKey(t.rosterId, w)]),
        }))
        .sort(
          (a, b) =>
            b.cells.reduce((s, c) => s + (c?.mean ?? 0), 0) -
            a.cells.reduce((s, c) => s + (c?.mean ?? 0), 0),
        ),
    [data.teams, data.forecasts, weeks],
  )

  if (weeks.length === 0)
    return <p className="empty">No projections yet for the remaining weeks.</p>

  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="proj-grid" aria-label="Projected scores by week">
          <thead>
            <tr>
              <th scope="col">Team</th>
              {weeks.map((w) => (
                <th key={w} scope="col" className={'num' + (isPlayoffWeek(w) ? ' is-playoff' : '')}>
                  Wk {w}
                  {isPlayoffWeek(w) ? <span className="muted small"> playoffs</span> : null}
                  {data.byeTeamsByWeek[w]?.length ? (
                    <span
                      className="muted small proj-grid__byes"
                      title={`NFL byes: ${data.byeTeamsByWeek[w]?.join(', ')}`}
                    >
                      {' '}
                      {data.byeTeamsByWeek[w]?.join(' ')}
                    </span>
                  ) : null}
                </th>
              ))}
              <th scope="col" className="num">
                Avg
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.map(({ team: t, cells }) => {
              const known = cells.filter((c): c is TeamWeekForecast => c !== undefined)
              const avg = known.length ? known.reduce((s, c) => s + c.mean, 0) / known.length : 0
              return (
                <tr
                  key={t.rosterId}
                  className={t.rosterId === rosterId ? 'is-selected' : undefined}
                >
                  <th scope="row">
                    <button type="button" className="link" onClick={() => setRosterId(t.rosterId)}>
                      {t.teamName}
                    </button>
                  </th>
                  {cells.map((c, i) => (
                    <td
                      key={weeks[i]}
                      className={
                        'num' +
                        (c && c.lineup.byes.length > 0 ? ' has-bye' : '') +
                        (c && c.lineup.emptySlots > 0 ? ' has-hole' : '')
                      }
                    >
                      <button
                        type="button"
                        className="link proj-grid__cell"
                        onClick={() => {
                          setRosterId(t.rosterId)
                          setWeek(weeks[i] ?? null)
                        }}
                        title={c ? cellTitle(c) : undefined}
                      >
                        {c ? fmt1(c.mean) : '—'}
                        {c && c.lineup.byes.length > 0 && (
                          <span
                            className="proj-grid__flag"
                            aria-label={`${c.lineup.byes.length} on bye`}
                          >
                            {c.lineup.byes.length}
                          </span>
                        )}
                      </button>
                    </td>
                  ))}
                  <td className="num col-strong">{fmt1(avg)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Projected score when starting the best possible lineup. A small number marks how many
        rostered players are on bye that week; a red cell means the roster cannot fill every
        starting slot. Pick a cell to see the lineup.
      </p>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ margin: 0, flex: '1 1 200px' }}>
          <span className="small muted">Team</span>
          <select
            aria-label="Team"
            value={rosterId ?? ''}
            onChange={(e) => setRosterId(Number(e.target.value))}
          >
            {data.teams.map((t) => (
              <option key={t.rosterId} value={t.rosterId}>
                {t.ownerId && t.ownerId === defaultOwnerId ? '★ ' : ''}
                {t.teamName}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0, flex: '0 1 140px' }}>
          <span className="small muted">Week</span>
          <select
            aria-label="Week"
            value={week ?? ''}
            onChange={(e) => setWeek(Number(e.target.value))}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
                {w === data.inProgressWeek ? ' (in progress)' : ''}
                {isPlayoffWeek(w) ? ' (playoffs)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {team && forecast && week !== null && (
        <LineupCard data={data} forecast={forecast} teamName={team.teamName} week={week} />
      )}
    </div>
  )
}

function cellTitle(c: TeamWeekForecast): string {
  const parts = [`Projected ${fmt1(c.mean)} ± ${fmt1(c.sd)}`]
  if (c.lineup.byes.length) parts.push(`${c.lineup.byes.length} on bye`)
  if (c.lineup.emptySlots)
    parts.push(`${c.lineup.emptySlots} empty slot${c.lineup.emptySlots === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function LineupCard({
  data,
  forecast,
  teamName,
  week,
}: {
  data: PredictionData
  forecast: TeamWeekForecast
  teamName: string
  week: number
}) {
  const { lineup } = forecast
  const name = (id: string | null) => (id ? (data.players[id]?.name ?? id) : '—')
  const pos = (id: string | null) => (id ? (data.players[id]?.positions[0] ?? '') : '')
  const nfl = (id: string | null) => (id ? (data.players[id]?.team ?? 'FA') : '')
  return (
    <div className="card lineup">
      <div className="card-header">
        <h3 style={{ margin: 0 }}>
          {teamName} · Week {week}
        </h3>
        <div className="muted small">
          Optimal lineup projects {fmt1(lineup.total)}
          {lineup.byes.length > 0 ? ` · ${lineup.byes.length} on bye` : ''}
          {lineup.emptySlots > 0
            ? ` · ${lineup.emptySlots} slot${lineup.emptySlots === 1 ? '' : 's'} unfilled`
            : ''}
        </div>
      </div>
      <div className="grid">
        <div>
          <h4 className="muted small" style={{ margin: '0 0 0.4rem' }}>
            Start
          </h4>
          <ul className="roster">
            {lineup.slots.map((s, i) => (
              <li key={`${s.slot}-${i}`} className={s.playerId ? undefined : 'is-empty'}>
                <span className={`pos ${s.slot}`}>{s.slot}</span>
                <span className="lineup__name">
                  {name(s.playerId)}
                  {s.playerId && (
                    <span className="muted small">
                      {' '}
                      {pos(s.playerId)} · {nfl(s.playerId)}
                    </span>
                  )}
                </span>
                <span className="num lineup__pts">{s.playerId ? fmt1(s.points) : 'empty'}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="muted small" style={{ margin: '0 0 0.4rem' }}>
            Bench
          </h4>
          {lineup.bench.length === 0 ? (
            <p className="empty">Nobody left over.</p>
          ) : (
            <ul className="roster">
              {lineup.bench.map((b) => (
                <li key={b.playerId} className={b.onBye ? 'is-bye' : undefined}>
                  <span className={`pos ${pos(b.playerId)}`}>{pos(b.playerId) || '?'}</span>
                  <span className="lineup__name">
                    {name(b.playerId)}
                    <span className="muted small"> {nfl(b.playerId)}</span>
                  </span>
                  <span className="num lineup__pts">
                    {b.onBye ? <span className="badge warn">bye</span> : fmt1(b.points)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
