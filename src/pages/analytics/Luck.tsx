import { useMemo } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { careerLuck, seasonLuck, type LuckLine } from '../../features/analytics/allplay.ts'
import { teamById } from '../../features/analytics/common.ts'
import { scheduleSwap } from '../../features/analytics/schedule.ts'
import { fmtPts, recordSortValue } from '../../features/standings/SeasonTable.tsx'
import type { SeasonStandings } from '../../features/standings/history.ts'
import { formatRecord, type SeasonTeam } from '../../features/standings/standings.ts'
import type { AnalyticsProps } from './AnalyticsPage.tsx'
import {
  ALL,
  Explainer,
  fmt2,
  fmtPct,
  heat,
  latestTeam,
  SeasonPicker,
  signClass,
  TeamCell,
} from './shared.tsx'

interface Row extends LuckLine {
  key: string
  team: SeasonTeam | undefined
  sub?: string
}

export default function Luck(props: AnalyticsProps) {
  const { history, seasons, scope, setScope, season, meOwnerId, keep } = props
  const all = scope === ALL

  const rows = useMemo<Row[]>(() => {
    if (all) {
      return careerLuck(history).map((r) => ({
        ...r,
        key: r.ownerId,
        team: latestTeam(history, r.ownerId),
        sub: `${r.ownerName} · ${r.seasons} season${r.seasons === 1 ? '' : 's'}`,
      }))
    }
    const teams = teamById(season)
    return seasonLuck(season).map((r) => ({
      ...r,
      key: String(r.rosterId),
      team: teams.get(r.rosterId),
    }))
  }, [all, history, season])

  const columns = useMemo<SortColumn<Row>[]>(
    () => [
      { key: 'team', label: 'Team', get: (r) => r.team?.teamName ?? '' },
      { key: 'record', label: 'Record', get: (r) => recordSortValue(r.h2h), className: 'num' },
      {
        key: 'allplay',
        label: 'All-play',
        get: (r) => recordSortValue(r.allPlay),
        className: 'num',
      },
      { key: 'pct', label: 'All-play %', get: (r) => r.allPlayPct, className: 'num' },
      { key: 'xw', label: 'Exp. W', get: (r) => r.expectedWins, className: 'num' },
      { key: 'w', label: 'Actual W', get: (r) => r.actualWins, className: 'num' },
      { key: 'luck', label: 'Luck', get: (r) => r.luck, className: 'num' },
      { key: 'lucky', label: 'Lucky W', get: (r) => r.luckyWins, className: 'num' },
      { key: 'unlucky', label: 'Unlucky L', get: (r) => r.unluckyLosses, className: 'num' },
      { key: 'pa', label: 'Opp avg', get: (r) => r.avgPointsAgainst, className: 'num' },
    ],
    [],
  )
  const shown = useMemo(() => rows.filter((r) => keep(r.team?.ownerId)), [rows, keep])
  const { sort, toggle, sorted } = useSortable(shown, columns, { key: 'luck', dir: 'desc' })
  const played = shown.filter((r) => r.weeks > 0)
  const luckiest = played.reduce<Row | null>((b, r) => (!b || r.luck > b.luck ? r : b), null)
  const unluckiest = played.reduce<Row | null>((b, r) => (!b || r.luck < b.luck ? r : b), null)

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Luck &amp; all-play</h2>
          <SeasonPicker seasons={seasons} value={scope} onChange={setScope} allowAll />
        </div>
        {luckiest && unluckiest && (
          <div className="stat-tiles mb">
            <div className="tile">
              <div className="label">Luckiest</div>
              <div className="value text">{luckiest.team?.teamName ?? '—'}</div>
              <div className="sub">{fmt2(luckiest.luck, true)} wins vs. expected</div>
            </div>
            <div className="tile">
              <div className="label">Unluckiest</div>
              <div className="value text">{unluckiest.team?.teamName ?? '—'}</div>
              <div className="sub">{fmt2(unluckiest.luck, true)} wins vs. expected</div>
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
                  <td className="num nowrap">{formatRecord(r.h2h)}</td>
                  <td className="num nowrap">{formatRecord(r.allPlay)}</td>
                  <td className="num">{fmtPct(r.allPlayPct)}</td>
                  <td className="num">{fmt2(r.expectedWins)}</td>
                  <td className="num">{r.actualWins}</td>
                  <td className={`num ${signClass(r.luck)}`}>
                    <strong>{fmt2(r.luck, true)}</strong>
                  </td>
                  <td className="num">{r.luckyWins}</td>
                  <td className="num">{r.unluckyLosses}</td>
                  <td className="num">
                    {r.avgPointsAgainst === null ? '—' : fmtPts(r.avgPointsAgainst)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Explainer>
          <strong>All-play</strong> is your record if you played every other team every week.{' '}
          <strong>Expected wins</strong> add up your weekly all-play win share: the wins an average
          schedule would have given you. <strong>Luck</strong> is actual wins minus expected wins.{' '}
          <strong>Lucky W</strong> are wins while scoring below that week&apos;s median;{' '}
          <strong>Unlucky L</strong> are losses while scoring above it. Head-to-head games only,
          regular season.
        </Explainer>
      </div>
      {all ? (
        <p className="muted small">Pick a single season to see the schedule swap grid.</p>
      ) : (
        <ScheduleSwapCard season={season} meOwnerId={meOwnerId} keep={keep} />
      )}
    </>
  )
}

function ScheduleSwapCard({
  season,
  meOwnerId,
  keep,
}: {
  season: SeasonStandings
  meOwnerId: string | null
  keep: AnalyticsProps['keep']
}) {
  const swap = useMemo(() => scheduleSwap(season), [season])
  const teams = useMemo(() => teamById(season), [season])
  const summaries = new Map(swap.summary.map((s) => [s.rosterId, s]))
  const weeks = season.weeksPlayed.length
  if (swap.rosterIds.length < 2 || weeks === 0) return null

  return (
    <div className="card">
      <div className="card-header">
        <h2>Schedule swap</h2>
        <span className="muted small">
          {season.season} · your scores (rows) vs. their schedule (columns)
        </span>
      </div>
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Team</th>
              {swap.rosterIds.map((id) =>
                !keep(teams.get(id)?.ownerId) ? null : (
                  <th key={id} className="num matrix__col" title={teams.get(id)?.teamName}>
                    {abbrev(teams.get(id)?.teamName)}
                  </th>
                ),
              )}
              <th className="num">Avg W</th>
              <th className="num">Better / worse</th>
              <th className="num">Sched. ease</th>
            </tr>
          </thead>
          <tbody>
            {swap.rosterIds.map((a, i) => {
              const team = teams.get(a)
              if (!keep(team?.ownerId)) return null
              const own = swap.cells[i]?.[i]
              const s = summaries.get(a)
              return (
                <tr key={a} className={team?.ownerId === meOwnerId ? 'me' : undefined}>
                  <td>{team && <TeamCell team={team} />}</td>
                  {swap.rosterIds.map((b, j) => {
                    if (!keep(teams.get(b)?.ownerId)) return null
                    const line = swap.cells[i]?.[j]
                    if (!line) return <td key={b} />
                    const diff = own ? line.wins - own.wins : 0
                    return (
                      <td
                        key={b}
                        className={`num nowrap${i === j ? ' matrix__self' : ''}`}
                        style={i === j ? undefined : heat(diff / Math.max(1, weeks / 3))}
                      >
                        {formatRecord(line)}
                      </td>
                    )
                  })}
                  <td className="num">{s ? s.avgWins.toFixed(2) : '—'}</td>
                  <td className="num nowrap">
                    {s ? (
                      <>
                        <span className="success">{s.betterWith}</span> /{' '}
                        <span className="error">{s.worseWith}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">{s?.scheduleEase?.toFixed(2) ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Explainer>
        Each row replays one team&apos;s weekly scores against every other team&apos;s opponents
        (when that opponent is the row team itself, it plays the column team instead). Green cells
        are schedules that would have won you more games. <strong>Better / worse</strong> counts
        those schedules. <strong>Sched. ease</strong> is the average wins everyone else would have
        had on that team&apos;s schedule: lower means it was tougher.
      </Explainer>
    </div>
  )
}

function abbrev(name: string | undefined): string {
  if (!name) return '?'
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length > 1)
    return words
      .map((w) => w[0])
      .join('')
      .slice(0, 4)
      .toUpperCase()
  return name.slice(0, 4)
}
