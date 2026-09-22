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
import type {
  ClinchStatus,
  RemainingStrength,
  SimulationResult,
  TeamOdds,
} from '../engine/index.ts'
import { fmt1, fmtPct, fmtRecord, pctFill } from '../format.ts'
import type { PredictionData, PredictionTeam } from '../loader.ts'

type Row = PredictionTeam &
  TeamOdds & {
    rank: number
    clinch: ClinchStatus | undefined
    strength: RemainingStrength | undefined
  }

export default function OddsTable({
  data,
  result,
  clinch,
  strength,
  highlightOwnerId,
}: {
  data: PredictionData
  result: SimulationResult
  clinch: Map<number, ClinchStatus>
  strength: Map<number, RemainingStrength>
  highlightOwnerId?: string | null
}) {
  const rows = useMemo<Row[]>(() => {
    const odds = new Map(result.teams.map((t) => [t.rosterId, t]))
    return data.teams
      .flatMap((team) => {
        const o = odds.get(team.rosterId)
        return o
          ? [
              {
                ...team,
                ...o,
                clinch: clinch.get(team.rosterId),
                strength: strength.get(team.rosterId),
              },
            ]
          : []
      })
      .sort(
        (a, b) =>
          b.playoff - a.playoff ||
          a.averageSeed - b.averageSeed ||
          b.projectedWins - a.projectedWins,
      )
      .map((row, i) => ({ ...row, rank: i + 1 }))
  }, [data.teams, result.teams, clinch, strength])

  const playoffsSimulated = result.rounds > 0
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
        key: 'status',
        label: 'Status',
        title: 'Clinch status',
        get: (r) => statusSortValue(r.clinch),
        defaultDir: 'asc',
        className: 'col-num',
      },
      {
        key: 'playoff',
        label: 'Playoffs',
        title: 'Playoff odds',
        get: (r) => r.playoff,
        className: 'col-num col-strong',
      },
      ...(playoffsSimulated
        ? [
            {
              key: 'title',
              label: 'Title',
              title: 'Championship odds',
              get: (r: Row) => r.champion,
              className: 'col-num col-strong',
            },
            {
              key: 'final',
              label: 'Final',
              title: 'Reach the final',
              get: (r: Row) => r.final,
              className: 'col-num',
            },
          ]
        : []),
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
      {
        key: 'sos',
        label: 'Opp. proj.',
        title: 'Remaining schedule: average opponent projection',
        get: (r) => r.strength?.opponentAverage ?? null,
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
    [result.byes, seeds, playoffsSimulated],
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
                  <td className="col-num" data-label="Status">
                    <StatusBadge status={r.clinch} />
                  </td>
                  <td
                    className="col-num col-strong"
                    data-label="Playoffs"
                    style={{ background: pctFill(r.playoff) }}
                  >
                    {fmtPct(r.playoff)}
                  </td>
                  {playoffsSimulated && (
                    <td
                      className="col-num col-strong"
                      data-label="Title"
                      style={{ background: pctFill(r.champion) }}
                    >
                      {fmtPct(r.champion)}
                    </td>
                  )}
                  {playoffsSimulated && (
                    <td
                      className="col-num"
                      data-label="Final"
                      style={{ background: pctFill(r.final) }}
                    >
                      {fmtPct(r.final)}
                    </td>
                  )}
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
                  <td
                    className="col-num"
                    data-label="Opp. proj."
                    title={
                      r.strength?.opponentAverage != null
                        ? `${r.strength.games} game${r.strength.games === 1 ? '' : 's'} left · ${ordinal(r.strength.rank)} hardest`
                        : undefined
                    }
                  >
                    {r.strength?.opponentAverage != null ? fmt1(r.strength.opponentAverage) : '—'}
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

/** Clinched first, then by magic number, then eliminated last. */
function statusSortValue(s: ClinchStatus | undefined): number {
  if (!s) return 999
  if (s.clinchedBye) return 0
  if (s.clinchedPlayoffs) return 1
  if (s.eliminated) return 500
  return 10 + (s.magicNumber ?? 0)
}

function StatusBadge({ status }: { status: ClinchStatus | undefined }) {
  if (!status) return <span className="muted">—</span>
  if (status.clinchedBye)
    return (
      <span className="badge good" title="Clinched a first-round bye on wins alone">
        Bye ✓
      </span>
    )
  if (status.clinchedPlayoffs)
    return (
      <span className="badge good" title="Clinched a playoff spot on wins alone">
        Clinched
      </span>
    )
  if (status.eliminated)
    return (
      <span className="badge bad" title="Cannot reach the playoffs even by winning out">
        Out
      </span>
    )
  const magic = status.magicNumber
  const elim = status.eliminationNumber
  return (
    <span
      className="status-numbers"
      title={`Magic number ${magic ?? '—'}: wins (or losses by the team it must beat out) that clinch a spot. Elimination number ${elim ?? '—'}: losses (or wins by the team holding the last spot) that end the season.`}
    >
      <span className="muted small">M</span> {magic ?? '—'} <span className="muted small">E</span>{' '}
      {elim ?? '—'}
    </span>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? 'th'}`
}

function recordValue(line: { wins: number; losses: number; ties: number }): number {
  const games = line.wins + line.losses + line.ties
  const pct = games === 0 ? 0 : (line.wins + line.ties / 2) / games
  return pct * 1000 + line.wins
}
