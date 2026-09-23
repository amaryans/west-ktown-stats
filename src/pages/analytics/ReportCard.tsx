import { useMemo } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { teamById } from '../../features/analytics/common.ts'
import { careerCards, SKILLS, type Skill } from '../../features/analytics/reportCard.ts'
import type { SeasonReport } from '../../features/analytics/seasonReport.ts'
import { fmtPts } from '../../features/standings/SeasonTable.tsx'
import type { SeasonTeam } from '../../features/standings/standings.ts'
import type { AnalyticsProps } from './AnalyticsPage.tsx'
import { useReports } from './reports.ts'
import { ALL, Explainer, fmtPct, heat, latestTeam, SeasonPicker, TeamCell } from './shared.tsx'
import { useMovesData, type MovesData } from './useLineupData.ts'

const LABELS: Record<Skill, string> = {
  draft: 'Draft',
  waivers: 'Waivers',
  trades: 'Trades',
  lineups: 'Lineups',
}

interface Row {
  key: string
  team: SeasonTeam | undefined
  sub?: string
  seasons: number
  scores: Record<Skill, number | null>
  /** Raw numbers behind each score (single season only). */
  raw: Record<Skill, number | null> | null
  luckScore: number | null
  luck: number | null
  overall: number | null
  grade: string
}

export default function ReportCard(props: AnalyticsProps) {
  const moves = useMovesData(props.history)
  if (moves.error) {
    return <div className="banner error">Could not load data from Sleeper: {moves.error}</div>
  }
  if (!moves.data) return <div className="loading">{moves.progress ?? 'Loading…'}</div>
  return <ReportCardView {...props} data={moves.data} />
}

function rawLabel(skill: Skill, v: number | null): string {
  if (v === null) return '—'
  if (skill === 'lineups') return fmtPct(v)
  if (skill === 'trades') return `${v > 0 ? '+' : ''}${fmtPts(v)}`
  return fmtPts(v)
}

function ReportCardView({
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

  const rows = useMemo<Row[]>(() => {
    if (!all) {
      const report = reports.get(season.leagueId)
      if (!report) return []
      const teams = teamById(season)
      return [...report.cards.values()].map((c) => ({
        key: String(c.rosterId),
        team: teams.get(c.rosterId),
        seasons: 1,
        scores: c.scores,
        raw: c.raw,
        luckScore: c.luckScore,
        luck: c.luck,
        overall: c.overall,
        grade: c.grade,
      }))
    }
    // All-time: completed seasons only, so a few weeks of a new season don't swing it.
    const entries = seasons
      .filter((s) => s.complete)
      .flatMap((s) => {
        const report: SeasonReport | undefined = reports.get(s.leagueId)
        if (!report) return []
        const teams = teamById(s)
        return [...report.cards.values()].flatMap((card) => {
          const ownerId = teams.get(card.rosterId)?.ownerId
          return ownerId ? [{ key: ownerId, card }] : []
        })
      })
    return careerCards(entries).map((c) => {
      const team = latestTeam(history, c.key)
      return {
        key: c.key,
        team,
        sub: `${team?.ownerName ?? ''} · ${c.seasons} season${c.seasons === 1 ? '' : 's'}`,
        seasons: c.seasons,
        scores: c.scores,
        raw: null,
        luckScore: c.luckScore,
        luck: null,
        overall: c.overall,
        grade: c.grade,
      }
    })
  }, [all, reports, season, seasons, history])

  const columns = useMemo<SortColumn<Row>[]>(
    () => [
      { key: 'team', label: 'Team', get: (r) => r.team?.teamName ?? '' },
      { key: 'grade', label: 'Grade', get: (r) => r.overall, className: 'num' },
      { key: 'overall', label: 'Score', get: (r) => r.overall, className: 'num' },
      ...SKILLS.map((s) => ({
        key: s,
        label: LABELS[s],
        get: (r: Row) => r.scores[s],
        className: 'num',
      })),
      { key: 'luck', label: 'Luck', get: (r) => r.luckScore, className: 'num' },
    ],
    [],
  )
  const { sort, toggle, sorted } = useSortable(rows, columns, { key: 'grade', dir: 'desc' })

  return (
    <div className="card">
      <div className="card-header">
        <h2>Manager report card</h2>
        <SeasonPicker seasons={seasons} value={scope} onChange={setScope} allowAll />
      </div>
      {rows.length === 0 ? (
        <p className="empty">
          {all ? 'No completed seasons with Sleeper data yet.' : 'No data for this season.'}
        </p>
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
                    <span className={`grade grade--${r.grade}`}>{r.grade}</span>
                  </td>
                  <td className="num">
                    <strong>{r.overall === null ? '—' : Math.round(r.overall)}</strong>
                  </td>
                  {SKILLS.map((s) => {
                    const v = r.scores[s]
                    return (
                      <td
                        key={s}
                        className="num nowrap"
                        style={v === null ? undefined : heat((v - 50) / 50)}
                        title={r.raw ? `${LABELS[s]}: ${rawLabel(s, r.raw[s])}` : undefined}
                      >
                        {v === null ? '—' : Math.round(v)}
                        {r.raw && <div className="muted small">{rawLabel(s, r.raw[s])}</div>}
                      </td>
                    )
                  })}
                  <td className="num nowrap muted">
                    {r.luckScore === null ? '—' : Math.round(r.luckScore)}
                    {r.luck !== null && (
                      <div className="small">
                        {r.luck > 0 ? '+' : ''}
                        {r.luck.toFixed(1)} W
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Explainer>
        Each skill is scored 0–100 by where the team ranked in the league that season (100 = best,
        50 = middle): <strong>Draft</strong> is starter points from the draft class,{' '}
        <strong>Waivers</strong> starter points from pickups, <strong>Trades</strong> net starter
        points from trades (no trades counts as 0) and <strong>Lineups</strong> execution %. The{' '}
        <strong>grade</strong> averages the four: A ≥ 80, B ≥ 60, C ≥ 40, D ≥ 20, F below.{' '}
        <strong>Luck</strong> (actual minus expected wins) is shown but not graded.
        {all && ' All-time averages each completed season equally.'}
      </Explainer>
    </div>
  )
}
