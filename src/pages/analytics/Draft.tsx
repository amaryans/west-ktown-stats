import { useMemo, useState } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { useLeague } from '../../context/LeagueContext.tsx'
import { teamById } from '../../features/analytics/common.ts'
import {
  draftGrades,
  gradePicks,
  stealsAndBusts,
  summariseDrafts,
  type DraftGrade,
  type DraftSummary,
  type GradedPick,
} from '../../features/analytics/draft.ts'
import { grade } from '../../features/analytics/reportCard.ts'
import { normalizeName } from '../../features/keepers/value.ts'
import type { SeasonStandings } from '../../features/standings/history.ts'
import { fmtPts } from '../../features/standings/SeasonTable.tsx'
import type { SeasonTeam } from '../../features/standings/standings.ts'
import type { AnalyticsProps } from './AnalyticsPage.tsx'
import { ALL, Explainer, latestTeam, SeasonPicker, signClass, TeamCell } from './shared.tsx'
import { useMovesData, type MovesData } from './useLineupData.ts'

type Pick = GradedPick & { season: string; teams: Map<number, SeasonTeam> }

interface SeasonDraft {
  standings: SeasonStandings
  picks: Pick[]
  summaries: Map<number, DraftSummary>
  grades: Map<number, DraftGrade>
}

interface Row {
  key: string
  team: SeasonTeam | undefined
  sub?: string
  drafts: number
  preScore: number | null
  postScore: number | null
  change: number | null
  avgAdpValue: number | null
  starterPoints: number
  vsAverage: number
  avgValue: number | null
  best: Pick | null
  worst: Pick | null
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
const avgOf = (xs: (number | null)[]) => {
  const known = xs.filter((x): x is number => x !== null)
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null
}

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
  const [includeKeepers, setIncludeKeepers] = useState(false)
  const { statDefinitions, statEntries } = useLeague()

  // ADP per season from the "ADP" stat (filled by the Fetch ADP workflow), as keeper value uses.
  const adpBySeason = useMemo(() => {
    const def = statDefinitions.find((d) => /\badp\b/i.test(d.label) || /adp/i.test(d.key))
    const map = new Map<string, Map<string, number>>()
    if (!def) return map
    for (const e of statEntries) {
      if (e.definition_id !== def.id || e.week !== 0) continue
      const bySeason = map.get(String(e.season)) ?? new Map<string, number>()
      bySeason.set(normalizeName(e.subject), e.value)
      map.set(String(e.season), bySeason)
    }
    return map
  }, [statDefinitions, statEntries])

  const drafts = useMemo(() => {
    const out: SeasonDraft[] = []
    for (const s of all ? seasons : [season]) {
      const lineup = data.seasons.find((l) => l.leagueId === s.leagueId)
      if (!lineup || lineup.picks.length === 0) continue
      const adp = adpBySeason.get(s.season)
      const teams = teamById(s)
      const graded = gradePicks(lineup.picks, lineup.matchupsByWeek, {
        includeKeepers,
        adpOf: (p) => adp?.get(normalizeName(p.name || data.name(p.playerId))) ?? null,
      })
      const summaries = summariseDrafts(graded)
      out.push({
        standings: s,
        picks: graded.map((p) => ({ ...p, season: s.season, teams })),
        summaries: new Map(summaries.map((d) => [d.rosterId, d])),
        grades: new Map(draftGrades(summaries).map((g) => [g.rosterId, g])),
      })
    }
    return out
  }, [all, seasons, season, data, adpBySeason, includeKeepers])

  const rows = useMemo<Row[]>(() => {
    type Entry = { d: DraftSummary; g: DraftGrade; s: SeasonDraft }
    const groups = new Map<string, { team: SeasonTeam | undefined; entries: Entry[] }>()
    for (const s of drafts) {
      const teams = teamById(s.standings)
      for (const d of s.summaries.values()) {
        const g = s.grades.get(d.rosterId)
        if (!g) continue
        const team = teams.get(d.rosterId)
        const key = all
          ? (team?.ownerId ?? `${s.standings.season}:${d.rosterId}`)
          : String(d.rosterId)
        const group = groups.get(key) ?? { team, entries: [] }
        group.entries.push({ d, g, s })
        groups.set(key, group)
      }
    }
    return [...groups].map(([key, { team, entries }]) => {
      const preScore = avgOf(entries.map((e) => e.g.preScore))
      const postScore = avgOf(entries.map((e) => e.g.postScore))
      const tag = (p: GradedPick | null, s: SeasonDraft): Pick | null =>
        p ? { ...p, season: s.standings.season, teams: teamById(s.standings) } : null
      let best: Pick | null = null
      let worst: Pick | null = null
      for (const e of entries) {
        const b = tag(e.d.best, e.s)
        const w = tag(e.d.worst, e.s)
        if (b && (!best || b.value > best.value)) best = b
        if (w && (!worst || w.value < worst.value)) worst = w
      }
      const shown = all && team?.ownerId ? latestTeam(history, team.ownerId) : team
      return {
        key,
        team: shown,
        sub: all ? shown?.ownerName : undefined,
        drafts: entries.length,
        preScore,
        postScore,
        change: preScore === null || postScore === null ? null : postScore - preScore,
        avgAdpValue: avgOf(entries.map((e) => e.d.avgAdpValue)),
        starterPoints: entries.reduce((sum, e) => sum + e.d.starterPoints, 0),
        vsAverage: entries.reduce((sum, e) => sum + e.d.vsAverage, 0),
        avgValue: avgOf(entries.map((e) => e.d.avgValue)),
        best,
        worst,
      }
    })
  }, [drafts, all, history])

  const columns = useMemo<SortColumn<Row>[]>(
    () => [
      { key: 'team', label: 'Team', get: (r) => r.team?.teamName ?? '' },
      ...(all
        ? [{ key: 'drafts', label: 'Drafts', get: (r: Row) => r.drafts, className: 'num' }]
        : []),
      { key: 'pre', label: 'Draft day', get: (r) => r.preScore, className: 'num' },
      { key: 'post', label: 'Post-season', get: (r) => r.postScore, className: 'num' },
      { key: 'change', label: 'Change', get: (r) => r.change, className: 'num' },
      { key: 'vs', label: 'Class pts vs avg', get: (r) => r.vsAverage, className: 'num' },
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
  const { sort, toggle, sorted } = useSortable(rows, columns, { key: 'post', dir: 'desc' })

  const allPicks = useMemo(() => drafts.flatMap((d) => d.picks), [drafts])
  const { steals, busts } = useMemo(() => stealsAndBusts(allPicks, 8), [allPicks])
  const withAdp = useMemo(() => allPicks.filter((p) => p.adpValue !== null), [allPicks])
  const fell = useMemo(
    () =>
      withAdp
        .slice()
        .sort((a, b) => (b.adpValue ?? 0) - (a.adpValue ?? 0))
        .slice(0, 8),
    [withAdp],
  )
  const reaches = useMemo(
    () =>
      withAdp
        .slice()
        .sort((a, b) => (a.adpValue ?? 0) - (b.adpValue ?? 0))
        .slice(0, 8),
    [withAdp],
  )
  const inScope = all ? seasons : [season]
  const noDraft = inScope.filter((s) => !drafts.some((d) => d.standings.leagueId === s.leagueId))
  const noAdp = drafts
    .filter((d) => [...d.grades.values()].every((g) => g.preScore === null))
    .map((d) => d.standings.season)

  const pickName = (p: GradedPick) => p.name || data.name(p.playerId)
  const keeperTag = (p: GradedPick) =>
    p.isKeeper ? <span className="badge warn">keeper</span> : null
  const outcomeLine = (p: Pick) => (
    <li key={`${p.season}-${p.pickNo}`}>
      <strong className={`num ${signClass(p.value)}`}>{signed(p.value)}</strong> {pickName(p)}{' '}
      {keeperTag(p)}{' '}
      <span className="muted small">
        {p.positionPick && p.positionRank
          ? `taken ${p.position}${p.positionPick} (pick ${p.pickNo}), finished ${p.position}${p.positionRank}`
          : `pick ${p.pickNo}, finished ${p.finishRank}`}{' '}
        · {fmtPts(p.points)} pts · {p.teams.get(p.rosterId)?.teamName ?? '?'} · {p.season}
      </span>
    </li>
  )
  const adpLine = (p: Pick) => (
    <li key={`${p.season}-${p.pickNo}`}>
      <strong className={`num ${signClass(p.adpValue)}`}>{signed(p.adpValue)}</strong> {pickName(p)}{' '}
      {keeperTag(p)}{' '}
      <span className="muted small">
        {p.position ?? ''} · pick {p.pickNo}, ADP {p.adp} ·{' '}
        {p.teams.get(p.rosterId)?.teamName ?? '?'} · {p.season}
      </span>
    </li>
  )

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Draft grades</h2>
          <div className="row">
            <label className="toggle">
              <input
                type="checkbox"
                checked={includeKeepers}
                onChange={(e) => setIncludeKeepers(e.target.checked)}
              />
              <span className="toggle__track" aria-hidden="true" />
              <span className="toggle__label">Include keepers</span>
            </label>
            <SeasonPicker seasons={seasons} value={scope} onChange={setScope} allowAll />
          </div>
        </div>
        {drafts.length === 0 ? (
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
                    {all && <td className="num">{r.drafts}</td>}
                    <td className="num nowrap">
                      <GradeBadge score={r.preScore} />
                      <div className="muted small">
                        {r.avgAdpValue === null
                          ? 'no ADP'
                          : `${signed(Math.round(r.avgAdpValue * 10) / 10)} vs ADP`}
                      </div>
                    </td>
                    <td className="num nowrap">
                      <GradeBadge score={r.postScore} />
                      <div className="muted small">{fmtPts(r.starterPoints)} pts</div>
                    </td>
                    <td className="num nowrap">
                      <Change pre={r.preScore} post={r.postScore} />
                    </td>
                    <td className={`num ${signClass(r.vsAverage)}`}>
                      {r.vsAverage > 0 ? '+' : ''}
                      {fmtPts(r.vsAverage)}
                    </td>
                    <td className={`num ${signClass(r.avgValue)}`}>
                      {r.avgValue === null ? '—' : signed(Math.round(r.avgValue * 10) / 10)}
                    </td>
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
          <strong>Draft day</strong> grades how the draft looked when it happened: each pick against
          the player&apos;s ADP that year (ADP minus pick, so a player who fell to you is positive
          and a reach is negative), averaged and ranked against the league.{' '}
          <strong>Post-season</strong> grades what the draft delivered: the starter points its picks
          produced for the team, ranked against the league. Both use A = top fifth.{' '}
          <strong>Change</strong> is how far the outlook moved. <strong>Pick value</strong> compares
          where a player was taken among his position with where he finished at it: the 12th WR
          taken finishing WR3 is +9.{' '}
          {includeKeepers
            ? 'Keepers are included at the pick they cost.'
            : 'Keepers are left out; switch them on above, or see Stats → Advanced → Keeper success.'}
          {all && ' All-time averages each season’s grades.'}
          {noAdp.length > 0 &&
            ` No ADP for ${noAdp.join(', ')}, so no draft-day grade: run the Fetch ADP workflow with those seasons to add it.`}
          {noDraft.length > 0 &&
            ` No draft could be read for ${noDraft.map((s) => s.season).join(', ')}.`}
        </Explainer>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-header">
            <h2>Fell past ADP</h2>
            <span className="muted small">Draft day</span>
          </div>
          {fell.length === 0 ? (
            <p className="empty">No ADP for this season.</p>
          ) : (
            <ol className="record-list">{fell.map(adpLine)}</ol>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <h2>Biggest reaches</h2>
            <span className="muted small">Draft day</span>
          </div>
          {reaches.length === 0 ? (
            <p className="empty">No ADP for this season.</p>
          ) : (
            <ol className="record-list">{reaches.map(adpLine)}</ol>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <h2>Steals</h2>
            <span className="muted small">Post-season</span>
          </div>
          {steals.length === 0 ? (
            <p className="empty">None yet.</p>
          ) : (
            <ol className="record-list">{steals.map(outcomeLine)}</ol>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <h2>Busts</h2>
            <span className="muted small">Post-season · rounds 1–5</span>
          </div>
          {busts.length === 0 ? (
            <p className="empty">None yet.</p>
          ) : (
            <ol className="record-list">{busts.map(outcomeLine)}</ol>
          )}
        </div>
      </div>
    </>
  )
}

function GradeBadge({ score }: { score: number | null }) {
  const g = grade(score)
  return (
    <span
      className={`grade grade--${g}`}
      title={score === null ? undefined : `${Math.round(score)}/100`}
    >
      {g}
    </span>
  )
}

function Change({ pre, post }: { pre: number | null; post: number | null }) {
  if (pre === null || post === null) return <span className="muted">—</span>
  const diff = Math.round(post - pre)
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '–'
  return (
    <span className={signClass(diff)} title={`${Math.round(pre)} → ${Math.round(post)} out of 100`}>
      {grade(pre)} → {grade(post)} {arrow}
      {diff !== 0 ? Math.abs(diff) : ''}
    </span>
  )
}
