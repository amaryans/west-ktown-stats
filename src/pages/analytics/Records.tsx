import { useMemo } from 'react'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import {
  droughts,
  recordBook,
  streaks,
  tallyAwards,
  weeklyAwards,
  type AwardKey,
  type AwardTally,
  type GameRecord,
  type SeasonMark,
} from '../../features/analytics/records.ts'
import { fmtPts } from '../../features/standings/SeasonTable.tsx'
import { formatRecord } from '../../features/standings/standings.ts'
import type { AnalyticsProps } from './AnalyticsPage.tsx'
import { ALL, Explainer, SeasonPicker } from './shared.tsx'

const AWARDS: { key: AwardKey; icon: string; label: string; help: string }[] = [
  { key: 'high', icon: '🔥', label: 'Top score', help: 'Highest score of the week' },
  { key: 'low', icon: '🧊', label: 'Bottom score', help: 'Lowest score of the week' },
  { key: 'blowout', icon: '💥', label: 'Blowout', help: 'Biggest winning margin' },
  { key: 'closest', icon: '😬', label: 'Nail-biter', help: 'Smallest winning margin' },
  { key: 'heartbreak', icon: '💔', label: 'Heartbreak', help: 'Highest score in a loss' },
  { key: 'lucky', icon: '🍀', label: 'Stole one', help: 'Lowest score in a win' },
]

export default function Records(props: AnalyticsProps) {
  const { history, seasons, scope, setScope, season } = props
  const all = scope === ALL
  const inScope = useMemo(() => (all ? seasons : [season]), [all, seasons, season])

  const awards = useMemo(() => weeklyAwards(season).slice().reverse(), [season])
  const tally = useMemo(() => tallyAwards(inScope.flatMap(weeklyAwards)), [inScope])
  const book = useMemo(() => recordBook(inScope), [inScope])
  const runs = useMemo(() => streaks(history), [history])
  const dry = useMemo(() => droughts(history), [history])

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2>Weekly awards · {season.season}</h2>
          <SeasonPicker seasons={seasons} value={scope} onChange={setScope} allowAll />
        </div>
        {awards.length === 0 ? (
          <p className="empty">No games yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Wk</th>
                  {AWARDS.map((a) => (
                    <th key={a.key} title={a.help}>
                      {a.icon} {a.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {awards.map((w) => (
                  <tr key={w.week}>
                    <td className="num">{w.week}</td>
                    {AWARDS.map((a) => (
                      <td key={a.key}>
                        <AwardCell game={w[a.key]} kind={a.key} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {all && (
          <Explainer>Weekly awards show one season at a time: the newest is shown.</Explainer>
        )}
      </div>

      <TallyCard tally={tally} label={all ? 'All seasons' : season.season} />

      <div className="card">
        <div className="card-header">
          <h2>Record book</h2>
          <span className="muted small">
            {all ? 'All seasons' : season.season} · regular season
          </span>
        </div>
        <div className="grid">
          <GameList title="Highest scores" games={book.highestScores} show="points" />
          <GameList title="Lowest scores" games={book.lowestScores} show="points" />
          <GameList title="Biggest blowouts" games={book.biggestBlowouts} show="margin" />
          <GameList title="Closest games" games={book.closestGames} show="margin" />
          <GameList title="Most points in a loss" games={book.highestInLoss} show="points" />
          <GameList title="Fewest points in a win" games={book.lowestInWin} show="points" />
          <GameList title="Highest-scoring games" games={book.highestCombined} show="combined" />
          <MarkList title="Most points in a season" marks={book.mostPointsSeason} />
          <MarkList title="Fewest points in a season" marks={book.fewestPointsSeason} />
          <MarkList title="Best records" marks={book.bestRecord} record />
          <MarkList title="Worst records" marks={book.worstRecord} record />
        </div>
        <Explainer>Season totals only count completed seasons.</Explainer>
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-header">
            <h2>Longest streaks</h2>
            <span className="muted small">All seasons</span>
          </div>
          <StreakList title="Winning" list={runs.filter((s) => s.kind === 'win').slice(0, 5)} />
          <StreakList title="Losing" list={runs.filter((s) => s.kind === 'loss').slice(0, 5)} />
          <Explainer>
            Streaks carry over from one season to the next. Active streaks are marked with ●.
          </Explainer>
        </div>
        <div className="card">
          <div className="card-header">
            <h2>Title droughts</h2>
            <span className="muted small">Completed seasons</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Manager</th>
                  <th className="num">Titles</th>
                  <th className="num">Last title</th>
                  <th className="num">Seasons since</th>
                </tr>
              </thead>
              <tbody>
                {dry.map((d) => (
                  <tr key={d.ownerId}>
                    <td>{d.ownerName}</td>
                    <td className="num">{d.titles ? `🏆 ${d.titles}` : '—'}</td>
                    <td className="num">{d.lastTitle ?? 'Never'}</td>
                    <td className="num">{d.seasonsSince}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function AwardCell({ game, kind }: { game: GameRecord | null; kind: AwardKey }) {
  if (!game) return <span className="muted">—</span>
  const value =
    kind === 'blowout' || kind === 'closest' ? `by ${fmtPts(game.margin)}` : fmtPts(game.points)
  return (
    <div className="nowrap">
      <div>{game.team.teamName}</div>
      <div className="muted small">
        {value}
        {(kind === 'blowout' || kind === 'closest' || kind === 'heartbreak' || kind === 'lucky') &&
          ` vs ${game.opponent.teamName}`}
      </div>
    </div>
  )
}

function TallyCard({ tally, label }: { tally: AwardTally[]; label: string }) {
  const columns = useMemo<SortColumn<AwardTally>[]>(
    () => [
      { key: 'name', label: 'Manager', get: (r) => r.ownerName },
      ...AWARDS.map((a) => ({
        key: a.key,
        label: `${a.icon} ${a.label}`,
        title: a.label,
        get: (r: AwardTally) => r.counts[a.key],
        className: 'num',
      })),
    ],
    [],
  )
  const { sort, toggle, sorted } = useSortable(tally, columns, { key: 'high', dir: 'desc' })
  return (
    <div className="card">
      <div className="card-header">
        <h2>Award count</h2>
        <span className="muted small">{label}</span>
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
              <tr key={r.key}>
                <td>
                  <div>{r.ownerName}</div>
                  <div className="muted small">{r.teamName}</div>
                </td>
                {AWARDS.map((a) => (
                  <td key={a.key} className="num">
                    {r.counts[a.key] || <span className="muted">0</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GameList({
  title,
  games,
  show,
}: {
  title: string
  games: GameRecord[]
  show: 'points' | 'margin' | 'combined'
}) {
  return (
    <div>
      <h3 className="record-title">{title}</h3>
      {games.length === 0 ? (
        <p className="empty small">None yet.</p>
      ) : (
        <ol className="record-list">
          {games.map((g) => (
            <li key={`${g.season}-${g.week}-${g.team.rosterId}`}>
              <strong className="num">
                {show === 'margin' ? fmtPts(g.margin) : fmtPts(g.points)}
              </strong>{' '}
              {g.team.teamName}
              <span className="muted small">
                {show === 'points'
                  ? ` vs ${g.opponent.teamName} (${fmtPts(g.opponentPoints)})`
                  : show === 'combined'
                    ? ` ${fmtPts(g.points - g.opponentPoints)}–${fmtPts(g.opponentPoints)} ${g.opponent.teamName}`
                    : ` over ${g.opponent.teamName}`}{' '}
                · {g.season} wk {g.week}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function MarkList({
  title,
  marks,
  record,
}: {
  title: string
  marks: SeasonMark[]
  record?: boolean
}) {
  return (
    <div>
      <h3 className="record-title">{title}</h3>
      {marks.length === 0 ? (
        <p className="empty small">No completed seasons.</p>
      ) : (
        <ol className="record-list">
          {marks.map((m) => (
            <li key={`${m.team.season}-${m.team.rosterId}`}>
              <strong className="num">{record ? formatRecord(m.record) : fmtPts(m.value)}</strong>{' '}
              {m.team.teamName}
              <span className="muted small">
                {record ? ` · ${fmtPts(m.value)} PF` : ` · ${formatRecord(m.record)}`} ·{' '}
                {m.team.season}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function StreakList({ title, list }: { title: string; list: ReturnType<typeof streaks> }) {
  return (
    <div className="mb">
      <h3 className="record-title">{title}</h3>
      {list.length === 0 ? (
        <p className="empty small">None yet.</p>
      ) : (
        <ol className="record-list">
          {list.map((s) => (
            <li key={`${s.ownerId}-${s.kind}`}>
              <strong className="num">{s.length}</strong> {s.ownerName}
              {s.active && (
                <span className="success" title="Still going">
                  {' '}
                  ●
                </span>
              )}
              <span className="muted small">
                {' '}
                · {s.from.season} wk {s.from.week} – {s.to.season} wk {s.to.week}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
