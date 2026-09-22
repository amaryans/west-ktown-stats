import { useMemo } from 'react'
import Avatar from '../../../components/Avatar.tsx'
import {
  SortableTh,
  SortSelect,
  useSortable,
  type SortColumn,
} from '../../../components/sortable.tsx'
import { fmtPts } from '../../standings/SeasonTable.tsx'
import { formatRecord } from '../../standings/standings.ts'
import type { SimulationResult, TeamOdds } from '../engine/index.ts'
import { fmtPct, fmtRecord, pctFill } from '../format.ts'
import type { PredictionData, PredictionTeam } from '../loader.ts'

type Row = PredictionTeam & TeamOdds & { rank: number }

export default function OddsTable({
  data,
  result,
  highlightOwnerId,
}: {
  data: PredictionData
  result: SimulationResult
  highlightOwnerId?: string | null
}) {
  const rows = useMemo<Row[]>(() => {
    const odds = new Map(result.teams.map((t) => [t.rosterId, t]))
    return data.teams
      .flatMap((team) => {
        const o = odds.get(team.rosterId)
        return o ? [{ ...team, ...o }] : []
      })
      .sort(
        (a, b) =>
          b.playoff - a.playoff ||
          a.averageSeed - b.averageSeed ||
          b.projectedWins - a.projectedWins,
      )
      .map((row, i) => ({ ...row, rank: i + 1 }))
  }, [data.teams, result.teams])

  const seeds = Array.from({ length: result.playoffTeams }, (_, i) => i + 1)
  const columns = useMemo<SortColumn<Row>[]>(
    () => [
      {
        key: 'rank',
        label: '#',
        title: 'Rank',
        get: (r) => r.rank,
        defaultDir: 'asc',
        className: 'col-rank',
      },
      { key: 'team', label: 'Team', get: (r) => r.teamName, className: 'col-team' },
      { key: 'record', label: 'Record', get: (r) => recordValue(r.record), className: 'col-num' },
      {
        key: 'pf',
        label: 'PF',
        title: 'Points for',
        get: (r) => r.pointsFor,
        className: 'col-num',
      },
      {
        key: 'playoff',
        label: 'Playoffs',
        title: 'Playoff odds',
        get: (r) => r.playoff,
        className: 'col-num col-strong',
      },
      ...(result.byes > 0
        ? [
            {
              key: 'bye',
              label: 'Bye',
              title: 'First-round bye odds',
              get: (r: Row) => r.bye,
              className: 'col-num',
            },
          ]
        : []),
      {
        key: 'top',
        label: '1st seed',
        title: 'Top seed odds',
        get: (r) => r.topSeed,
        className: 'col-num',
      },
      {
        key: 'seed',
        label: 'Avg seed',
        title: 'Average finish',
        get: (r) => r.averageSeed,
        defaultDir: 'asc',
        className: 'col-num',
      },
      {
        key: 'projrec',
        label: 'Proj. record',
        title: 'Projected record',
        get: (r) => r.projectedWins,
        className: 'col-num',
      },
      {
        key: 'projpf',
        label: 'Proj. PF',
        title: 'Projected points for',
        get: (r) => r.projectedPointsFor,
        className: 'col-num',
      },
      ...seeds.map((seed) => ({
        key: `seed${seed}`,
        label: `Seed ${seed}`,
        title: `Seed ${seed} odds`,
        get: (r: Row) => r.seedDistribution[seed - 1] ?? 0,
        className: 'col-num col-seed',
      })),
    ],
    [result.byes, seeds],
  )
  const { sort, setSort, toggle, sorted } = useSortable(rows, columns)

  return (
    <>
      <div className="standings-sort">
        <SortSelect columns={columns} sort={sort} onChange={setSort} />
      </div>
      <div className="table-wrap">
        <table className="standings odds-table" aria-label="Playoff odds">
          <thead>
            <tr>
              {columns.map((c) => (
                <SortableTh key={c.key} column={c} sort={sort} onToggle={toggle} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isMe = Boolean(highlightOwnerId) && r.ownerId === highlightOwnerId
              return (
                <tr key={r.rosterId} className={isMe ? 'is-me' : undefined}>
                  <td className="col-rank" data-label="Rank">
                    {r.rank}
                  </td>
                  <td className="col-team">
                    <div className="team">
                      <Avatar src={r.avatarSrc} name={r.teamName} />
                      <div className="team__names">
                        <div className="team__name">{r.teamName}</div>
                        <div className="team__owner">{r.ownerName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="col-num" data-label="Record">
                    {formatRecord(r.record)}
                  </td>
                  <td className="col-num" data-label="PF">
                    {fmtPts(r.pointsFor)}
                  </td>
                  <td
                    className="col-num col-strong"
                    data-label="Playoffs"
                    style={{ background: pctFill(r.playoff) }}
                  >
                    {fmtPct(r.playoff)}
                  </td>
                  {result.byes > 0 && (
                    <td className="col-num" data-label="Bye" style={{ background: pctFill(r.bye) }}>
                      {fmtPct(r.bye)}
                    </td>
                  )}
                  <td
                    className="col-num"
                    data-label="1st seed"
                    style={{ background: pctFill(r.topSeed) }}
                  >
                    {fmtPct(r.topSeed)}
                  </td>
                  <td className="col-num" data-label="Avg seed">
                    {(Math.round(r.averageSeed * 10) / 10).toFixed(1)}
                  </td>
                  <td className="col-num" data-label="Proj. record">
                    {fmtRecord(r.projectedWins, r.projectedLosses, r.projectedTies)}
                  </td>
                  <td className="col-num" data-label="Proj. PF">
                    {fmtPts(r.projectedPointsFor)}
                  </td>
                  {seeds.map((seed) => (
                    <td
                      key={seed}
                      className="col-num col-seed"
                      data-label={`Seed ${seed}`}
                      style={{ background: pctFill(r.seedDistribution[seed - 1] ?? 0) }}
                    >
                      {fmtPct(r.seedDistribution[seed - 1] ?? 0)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function recordValue(line: { wins: number; losses: number; ties: number }): number {
  const games = line.wins + line.losses + line.ties
  const pct = games === 0 ? 0 : (line.wins + line.ties / 2) / games
  return pct * 1000 + line.wins
}
