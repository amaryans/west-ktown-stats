import { useMemo } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { teamById } from '../../features/analytics/common.ts'
import { stealsAndBusts, type GradedPick } from '../../features/analytics/draft.ts'
import { grade, percentiles } from '../../features/analytics/reportCard.ts'
import type { SeasonReport } from '../../features/analytics/seasonReport.ts'
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
  drafts: number
  /** Mean 0–100 percentile of the draft class's starter points. */
  score: number | null
  starterPoints: number
  vsAverage: number
  avgValue: number | null
  best: (GradedPick & { season: string }) | null
  worst: (GradedPick & { season: string }) | null
}

export default function Draft(props: AnalyticsProps) {
  const moves = useMovesData(props.history)
  if (moves.error) {
    return <div className="banner error">Could not load drafts from Sleeper: {moves.error}</div>
  }
  if (!moves.data) return <div className="loading">{moves.progress ?? 'Loading…'}</div>
  return <DraftView {...props} data={moves.data} />
}

const signed = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n}`)

function DraftView({
  history,
  seasons,
  scope,
  setScope,
  season,
  meOwnerId,
  data,
}: AnalyticsProps & { data: MovesData }) {
  const all = scope === ALL
  const reports = useReports(data, seasons)
  const scoped = useMemo(
    () =>
      (all ? seasons : [season])
        .map((s) => reports.get(s.leagueId))
        .filter((r): r is SeasonReport => r !== undefined && r.drafts.size > 0),
    [all, seasons, season, reports],
  )

  const rows = useMemo<Row[]>(() => {
    const out = new Map<string, Row & { scores: number[] }>()
    for (const report of scoped) {
      const teams = teamById(report.standings)
      const list = [...report.drafts.values()]
      const pct = percentiles(list.map((d) => d.starterPoints))
      list.forEach((d, i) => {
        const team = teams.get(d.rosterId)
        const key = all
          ? (team?.ownerId ?? `${report.standings.season}:${d.rosterId}`)
          : String(d.rosterId)
        const row = out.get(key) ?? {
          key,
          team: all && team?.ownerId ? latestTeam(history, team.ownerId) : team,
          sub: all ? team?.ownerName : undefined,
          drafts: 0,
          score: null,
          scores: [],
          starterPoints: 0,
          vsAverage: 0,
          avgValue: null,
          best: null,
          worst: null,
        }
        const s = report.standings.season
        row.drafts++
        const p = pct[i]
        if (p !== null && p !== undefined) row.scores.push(p)
        row.starterPoints = Math.round((row.starterPoints + d.starterPoints) * 100) / 100
        row.vsAverage = Math.round((row.vsAverage + d.vsAverage) * 100) / 100
        row.avgValue =
          d.avgValue === null
            ? row.avgValue
            : Math.round(
                (((row.avgValue ?? 0) * (row.drafts - 1) + d.avgValue) / row.drafts) * 10,
              ) / 10
        if (d.best && (!row.best || d.best.value > row.best.value))
          row.best = { ...d.best, season: s }
        if (d.worst && (!row.worst || d.worst.value < row.worst.value))
          row.worst = { ...d.worst, season: s }
        out.set(key, row)
      })
    }
    return [...out.values()].map((r) => ({
      ...r,
      score: r.scores.length ? r.scores.reduce((a, b) => a + b, 0) / r.scores.length : null,
    }))
  }, [scoped, all, history])

  const columns = useMemo<SortColumn<Row>[]>(
    () => [
      { key: 'team', label: 'Team', get: (r) => r.team?.teamName ?? '' },
      { key: 'grade', label: 'Grade', get: (r) => r.score, className: 'num' },
      ...(all
        ? [{ key: 'drafts', label: 'Drafts', get: (r: Row) => r.drafts, className: 'num' }]
        : []),
      { key: 'pts', label: 'Class starter pts', get: (r) => r.starterPoints, className: 'num' },
      { key: 'vs', label: 'vs avg', get: (r) => r.vsAverage, className: 'num' },
      { key: 'value', label: 'Avg pick value', get: (r) => r.avgValue, className: 'num' },
      { key: 'best', label: 'Best pick', get: (r) => r.best?.value ?? null, className: 'num' },
      {
        key: 'worst',
        label: 'Worst pick',
        get: (r) => r.worst?.value ?? null,
        defaultDir: 'asc',
        className: 'num',
      },
    ],
    [all],
  )
  const { sort, toggle, sorted } = useSortable(rows, columns, { key: 'grade', dir: 'desc' })

  const allPicks = useMemo(
    () =>
      scoped.flatMap((r) =>
        r.picks.map((p) => ({ ...p, season: r.standings.season, teams: teamById(r.standings) })),
      ),
    [scoped],
  )
  const { steals, busts } = useMemo(() => stealsAndBusts(allPicks, 8), [allPicks])
  const missing = (all ? seasons : [season]).filter((s) => {
    const r = reports.get(s.leagueId)
    return !r || r.drafts.size === 0
  })

  const pickName = (p: GradedPick) => p.name || data.name(p.playerId)
  const pickLine = (p: GradedPick & { season: string; teams: Map<number, SeasonTeam> }) => (
    <li key={`${p.season}-${p.pickNo}`}>
      <strong className={`num ${signClass(p.value)}`}>{signed(p.value)}</strong> {pickName(p)}{' '}
      <span className="muted small">
        {p.positionPick && p.positionRank
          ? `taken ${p.position}${p.positionPick} (pick ${p.pickNo}), finished ${p.position}${p.positionRank}`
          : `pick ${p.pickNo}, finished ${p.finishRank}`}{' '}
        · {fmtPts(p.points)} pts · {p.teams.get(p.rosterId)?.teamName ?? '?'} · {p.season}
      </span>
    </li>
  )

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Draft grades</h2>
          <SeasonPicker seasons={seasons} value={scope} onChange={setScope} allowAll />
        </div>
        {scoped.length === 0 ? (
          <p className="empty">No draft on Sleeper for this season.</p>
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
                {sorted.map((r) => (
                  <tr key={r.key} className={r.team?.ownerId === meOwnerId ? 'me' : undefined}>
                    <td>{r.team && <TeamCell team={r.team} sub={r.sub} />}</td>
                    <td className="num">
                      <span className={`grade grade--${grade(r.score)}`}>{grade(r.score)}</span>
                    </td>
                    {all && <td className="num">{r.drafts}</td>}
                    <td className="num">{fmtPts(r.starterPoints)}</td>
                    <td className={`num ${signClass(r.vsAverage)}`}>
                      {r.vsAverage > 0 ? '+' : ''}
                      {fmtPts(r.vsAverage)}
                    </td>
                    <td className={`num ${signClass(r.avgValue)}`}>{signed(r.avgValue)}</td>
                    <td className="nowrap">
                      {r.best ? (
                        <>
                          {pickName(r.best)}{' '}
                          <span className="muted small">
                            {signed(r.best.value)}
                            {all ? ` · ${r.best.season}` : ''}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="nowrap">
                      {r.worst ? (
                        <>
                          {pickName(r.worst)}{' '}
                          <span className="muted small">
                            {signed(r.worst.value)}
                            {all ? ` · ${r.worst.season}` : ''}
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
        )}
        <Explainer>
          A draft is graded on the <strong>starter points</strong> its picks produced for the team
          that made them, ranked against the rest of the league that season (A = top fifth).{' '}
          <strong>Pick value</strong> compares where a player was taken among his position with
          where he finished at it (points while on a roster here): the 12th WR taken finishing WR3
          is +9. Keepers are left out; see Stats → Advanced → Keeper success for those.
          {missing.length > 0 &&
            ` No draft could be read for ${missing.map((s) => s.season).join(', ')}.`}
        </Explainer>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-header">
            <h2>Steals</h2>
            <span className="muted small">{all ? 'All seasons' : season.season}</span>
          </div>
          {steals.length === 0 ? (
            <p className="empty">None yet.</p>
          ) : (
            <ol className="record-list">{steals.map((p) => pickLine(p))}</ol>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <h2>Busts</h2>
            <span className="muted small">Rounds 1–5</span>
          </div>
          {busts.length === 0 ? (
            <p className="empty">None yet.</p>
          ) : (
            <ol className="record-list">{busts.map((p) => pickLine(p))}</ol>
          )}
        </div>
      </div>
    </>
  )
}
