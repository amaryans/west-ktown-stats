import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../../components/Avatar.tsx'
import HistoryStatus from '../../components/HistoryStatus.tsx'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import {
  managerRecords,
  scoreKeepers,
  seasonOutcomes,
  type KeeperOutcome,
  type ManagerKeeperRecord,
  type SeasonSuccessInput,
} from '../../features/keepers/success.ts'
import { loadKeeperSuccessRaw, type SeasonRaw } from '../../features/keepers/successLoader.ts'
import { normalizeName } from '../../features/keepers/value.ts'
import { loadPlayers, playerName, type PlayersDump } from '../../lib/players.ts'
import { ordinal } from '../team/TeamPage.tsx'

const fmt1 = (n: number | null, signed = false) =>
  n === null ? '—' : `${signed && n > 0 ? '+' : ''}${Math.round(n * 10) / 10}`
const fmtPct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)
const scoreClass = (n: number | null) =>
  n === null ? '' : n >= 60 ? 'success' : n < 40 ? 'error' : ''

/** Everyone's keepers, judged by draft-day value, performance against price and team impact. */
export default function KeeperSuccess() {
  const { history, keeperLists, statDefinitions, statEntries, me } = useLeague()
  const [raw, setRaw] = useState<{
    loading: boolean
    progress: string | null
    error: string | null
    seasons: SeasonRaw[] | null
  }>({ loading: false, progress: null, error: null, seasons: null })
  const [players, setPlayers] = useState<PlayersDump | null>(null)

  const historyData = history.data
  useEffect(() => {
    if (!historyData) return
    let active = true
    setRaw({ loading: true, progress: 'Reading drafts…', error: null, seasons: null })
    loadKeeperSuccessRaw(historyData, (progress) => {
      if (active) setRaw((s) => ({ ...s, progress }))
    })
      .then((seasons) => {
        if (active) setRaw({ loading: false, progress: null, error: null, seasons })
      })
      .catch((err: unknown) => {
        if (active)
          setRaw({ loading: false, progress: null, error: errorMessage(err), seasons: null })
      })
    loadPlayers()
      .then((dump) => {
        if (active) setPlayers(dump)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [historyData])

  // ADP per season from the "ADP" stat (hand-entered or synced by the Fetch ADP workflow).
  const adpBySeason = useMemo(() => {
    const def = statDefinitions.find((d) => /\badp\b/i.test(d.label) || /adp/i.test(d.key))
    const map = new Map<number, Map<string, number>>()
    if (!def) return map
    for (const e of statEntries) {
      if (e.definition_id !== def.id || e.week !== 0) continue
      const season = map.get(e.season) ?? new Map<string, number>()
      season.set(normalizeName(e.subject), e.value)
      map.set(e.season, season)
    }
    return map
  }, [statDefinitions, statEntries])

  const outcomes = useMemo<KeeperOutcome[]>(() => {
    if (!raw.seasons) return []
    const info = (id: string) => {
      const p = players?.[id]
      return p ? { name: playerName(p, id), position: p.position ?? null } : undefined
    }
    const all = raw.seasons.flatMap((s) => {
      const input: SeasonSuccessInput = {
        season: s.season,
        leagueId: s.leagueId,
        complete: s.complete,
        picks: s.picks,
        savedKeeperIds: keeperLists.find((k) => k.season === s.season)?.player_ids ?? [],
        matchupsByWeek: s.matchupsByWeek,
        teams: s.teams,
        adpByName: adpBySeason.get(s.season) ?? new Map(),
        playerInfo: info,
      }
      return seasonOutcomes(input)
    })
    return scoreKeepers(all)
  }, [raw.seasons, keeperLists, adpBySeason, players])

  const managers = useMemo(() => managerRecords(outcomes), [outcomes])

  const seasonsWithKeepers = useMemo(
    () => [...new Set(outcomes.map((o) => o.season))].sort((a, b) => b - a),
    [outcomes],
  )
  const seasonsMissingAdp = seasonsWithKeepers.filter((s) => !adpBySeason.has(s))
  const seasonsWithoutKeepers = (raw.seasons ?? [])
    .filter((s) => !seasonsWithKeepers.includes(s.season))
    .sort((a, b) => b.season - a.season)

  const [seasonFilter, setSeasonFilter] = useState<'all' | number>('all')
  const [managerFilter, setManagerFilter] = useState<string>('all')
  const filtered = useMemo(
    () =>
      outcomes.filter(
        (o) =>
          (seasonFilter === 'all' || o.season === seasonFilter) &&
          (managerFilter === 'all' || (o.ownerId ?? `roster:${o.rosterId}`) === managerFilter),
      ),
    [outcomes, seasonFilter, managerFilter],
  )

  const bestKeeper = outcomes.reduce<KeeperOutcome | null>(
    (best, o) => (o.score !== null && (best === null || o.score > (best.score ?? -1)) ? o : best),
    null,
  )
  const topManager = managers[0] ?? null

  return (
    <div className="stack">
      <HistoryStatus />
      {historyData && (
        <>
          <div className="muted small">
            Every keeper in the league&apos;s history, judged three ways: how much less the keeper
            cost than the player&apos;s draft price (<strong>draft value</strong>), where the player
            finished that season against that price (<strong>vs price</strong>), and how much of the
            team&apos;s scoring he carried (<strong>impact</strong>). The{' '}
            <strong>keeper score</strong> (0–100) is a percentile against every keeper here,
            averaged over the parts that are known. <MethodDetails />
          </div>

          {raw.loading && <div className="loading">{raw.progress ?? 'Loading…'}</div>}
          {raw.error && (
            <div className="banner error">Could not read the drafts from Sleeper: {raw.error}</div>
          )}

          {raw.seasons && outcomes.length === 0 && (
            <div className="banner warn">
              No keepers found in any season. Keepers are picked up from Sleeper&apos;s keeper flags
              on each draft and from the lists saved under{' '}
              <Link to="/preseason/keepers">Preseason → Keepers</Link>.
            </div>
          )}

          {outcomes.length > 0 && (
            <>
              <div className="stat-tiles">
                <div className="tile">
                  <div className="label">Keepers judged</div>
                  <div className="value">{outcomes.length}</div>
                  <div className="sub">
                    {seasonsWithKeepers.length} season{seasonsWithKeepers.length === 1 ? '' : 's'}
                  </div>
                </div>
                {topManager && (
                  <div className="tile">
                    <div className="label">Best at keepers</div>
                    <div className="value text">{topManager.ownerName}</div>
                    <div className="sub">
                      avg score {fmt1(topManager.avgScore)} over {topManager.keepers} keeper
                      {topManager.keepers === 1 ? '' : 's'}
                    </div>
                  </div>
                )}
                {bestKeeper && (
                  <div className="tile">
                    <div className="label">Best keeper ever</div>
                    <div className="value text">{bestKeeper.name}</div>
                    <div className="sub">
                      {bestKeeper.ownerName}, {bestKeeper.season} · score {bestKeeper.score}
                    </div>
                  </div>
                )}
              </div>

              {seasonsMissingAdp.length > 0 && (
                <div className="banner warn small">
                  No ADP loaded for {seasonsMissingAdp.join(', ')}, so draft value is blank for
                  those years and the score leans on performance and impact. Run the{' '}
                  <em>Fetch ADP</em> workflow with seasons &quot;{seasonsMissingAdp.join(',')}
                  &quot; to fill it in.
                </div>
              )}

              <ManagersTable managers={managers} meId={me?.sleeper_user_id ?? null} />

              <div className="card">
                <div className="card-header">
                  <h2>Every keeper</h2>
                  <div className="row" style={{ gap: '0.5rem' }}>
                    <select
                      aria-label="Season"
                      style={{ width: 'auto', padding: '0.3rem 0.45rem' }}
                      value={seasonFilter}
                      onChange={(e) =>
                        setSeasonFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                      }
                    >
                      <option value="all">All seasons</option>
                      {seasonsWithKeepers.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Manager"
                      style={{ width: 'auto', padding: '0.3rem 0.45rem' }}
                      value={managerFilter}
                      onChange={(e) => setManagerFilter(e.target.value)}
                    >
                      <option value="all">All managers</option>
                      {managers.map((m) => {
                        const key = m.ownerId ?? `roster:${m.latestTeamName}`
                        return (
                          <option key={key} value={key}>
                            {m.ownerName}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>
                <KeepersTable rows={filtered} meId={me?.sleeper_user_id ?? null} />
              </div>

              {seasonsWithoutKeepers.length > 0 && (
                <p className="muted small" style={{ margin: 0 }}>
                  No keepers found for {seasonsWithoutKeepers.map((s) => s.season).join(', ')}
                  {seasonsWithoutKeepers.some((s) => s.draftError)
                    ? ` (${seasonsWithoutKeepers
                        .filter((s) => s.draftError)
                        .map((s) => `${s.season}: ${s.draftError}`)
                        .join('; ')})`
                    : ''}
                  . If players were kept those years, record them under{' '}
                  <Link to="/preseason/keepers">Preseason → Keepers</Link>.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function MethodDetails() {
  return (
    <details style={{ display: 'inline' }}>
      <summary
        style={{
          display: 'inline',
          cursor: 'pointer',
          color: 'var(--accent)',
          textDecoration: 'underline',
        }}
      >
        How it is worked out
      </summary>
      <ul style={{ marginTop: '0.4rem' }}>
        <li>
          <strong>Draft value</strong> = pick used − ADP, so positive is good: a player going 30th
          in drafts and kept with the 80th pick is +50 picks, kept for less than his draft price.
          Negative means the keeper cost more than he would have in the draft. ADP comes from the
          &quot;ADP&quot; stat for that season.
        </li>
        <li>
          <strong>Finish</strong> ranks every player drafted that year by regular-season points in
          the league&apos;s own scoring, counted while on any roster in the league.{' '}
          <strong>Vs price</strong> = pick used − finish, so +40 means he finished 40 places better
          than he was priced.
        </li>
        <li>
          <strong>Impact</strong> = the keeper&apos;s points in weeks he started ÷ the team&apos;s
          total regular-season score, with weeks started and the team&apos;s finish alongside.
        </li>
        <li>
          <strong>Keeper score</strong> = the average of the keeper&apos;s percentile on each of
          those three among every keeper listed, ×100. 50 is a typical keeper; 90 is a
          league-history great. The season in progress is included with the weeks played so far.
        </li>
      </ul>
    </details>
  )
}

function ManagersTable({
  managers,
  meId,
}: {
  managers: ManagerKeeperRecord[]
  meId: string | null
}) {
  const columns = useMemo<SortColumn<ManagerKeeperRecord>[]>(
    () => [
      { key: 'manager', label: 'Manager', get: (m) => m.ownerName },
      { key: 'keepers', label: 'Keepers', get: (m) => m.keepers, className: 'num' },
      {
        key: 'score',
        label: 'Score',
        title: 'Average keeper score',
        get: (m) => m.avgScore,
        className: 'num',
      },
      {
        key: 'draft',
        label: 'Draft value',
        title: 'Average draft value (picks saved against ADP)',
        get: (m) => m.avgDraftValue,
        className: 'num',
      },
      {
        key: 'perf',
        label: 'Vs price',
        title: 'Average finish against price (picks)',
        get: (m) => m.avgPerformance,
        className: 'num',
      },
      {
        key: 'impact',
        label: 'Impact',
        title: 'Average share of team points',
        get: (m) => m.avgImpactShare,
        className: 'num',
      },
      {
        key: 'hits',
        label: 'Hit rate',
        title: 'Keepers who finished at or above their price',
        get: (m) => (m.keepers ? m.hits / m.keepers : null),
        className: 'num',
      },
      { key: 'best', label: 'Best keeper', get: (m) => m.best?.score ?? null },
    ],
    [],
  )
  const { sort, toggle, sorted } = useSortable(managers, columns)
  return (
    <div className="card">
      <div className="card-header">
        <h2>Who keeps best</h2>
        <span className="muted small">Ranked by average keeper score</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              {columns.map((c) => (
                <SortableTh key={c.key} column={c} sort={sort} onToggle={toggle} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => (
              <tr
                key={m.ownerId ?? m.latestTeamName}
                className={m.ownerId && m.ownerId === meId ? 'me' : undefined}
              >
                <td className="num muted">{i + 1}</td>
                <td>
                  <div className="team team--nowrap">
                    <Avatar src={m.avatarSrc} name={m.ownerName} />
                    <div className="team__names">
                      <div className="team__name">{m.ownerName}</div>
                      <div className="team__owner">
                        {m.latestTeamName} · {m.seasons} season{m.seasons === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="num">{m.keepers}</td>
                <td className={`num ${scoreClass(m.avgScore)}`}>
                  <strong>{fmt1(m.avgScore)}</strong>
                </td>
                <td className="num">{fmt1(m.avgDraftValue, true)}</td>
                <td className="num">{fmt1(m.avgPerformance, true)}</td>
                <td className="num">{fmtPct(m.avgImpactShare)}</td>
                <td className="num">
                  {fmtPct(m.keepers ? m.hits / m.keepers : null)}
                  <div className="muted small">
                    {m.hits}/{m.keepers}
                  </div>
                </td>
                <td className="nowrap">
                  {m.best ? (
                    <>
                      {m.best.name}
                      <div className="muted small">
                        {m.best.season} · score {m.best.score}
                      </div>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KeepersTable({ rows, meId }: { rows: KeeperOutcome[]; meId: string | null }) {
  const columns = useMemo<SortColumn<KeeperOutcome>[]>(
    () => [
      { key: 'season', label: 'Season', get: (o) => o.season, className: 'num' },
      { key: 'manager', label: 'Manager', get: (o) => o.ownerName },
      { key: 'player', label: 'Player', get: (o) => o.name },
      {
        key: 'cost',
        label: 'Cost',
        title: 'Pick used',
        get: (o) => o.keepPick,
        defaultDir: 'asc',
        className: 'num',
      },
      { key: 'adp', label: 'ADP', get: (o) => o.adp, defaultDir: 'asc', className: 'num' },
      {
        key: 'draft',
        label: 'Draft value',
        title: 'Picks saved against ADP',
        get: (o) => o.draftValue,
        className: 'num',
      },
      { key: 'points', label: 'Points', get: (o) => o.points, className: 'num' },
      {
        key: 'finish',
        label: 'Finish',
        title: 'Finish among drafted players',
        get: (o) => o.finishRank,
        defaultDir: 'asc',
        className: 'num',
      },
      { key: 'perf', label: 'Vs price', get: (o) => o.performance, className: 'num' },
      {
        key: 'impact',
        label: 'Impact',
        title: 'Share of team points',
        get: (o) => o.impactShare,
        className: 'num',
      },
      {
        key: 'team',
        label: 'Team',
        title: 'Team finish',
        get: (o) => o.teamRank,
        defaultDir: 'asc',
      },
      { key: 'score', label: 'Score', get: (o) => o.score, className: 'num' },
    ],
    [],
  )
  const { sort, toggle, sorted } = useSortable(rows, columns, { key: 'score', dir: 'desc' })
  if (rows.length === 0) return <p className="empty">No keepers match.</p>
  return (
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
          {sorted.map((o) => (
            <tr
              key={`${o.season}:${o.playerId}:${o.rosterId}`}
              className={o.ownerId && o.ownerId === meId ? 'me' : undefined}
            >
              <td className="num nowrap">
                {o.season}
                {!o.complete && (
                  <div className="muted small" title="Season in progress">
                    so far
                  </div>
                )}
              </td>
              <td className="nowrap">
                {o.ownerName}
                <div className="muted small">{o.teamName}</div>
              </td>
              <td>
                <div className="row" style={{ gap: '0.4rem', flexWrap: 'nowrap' }}>
                  {o.position && (
                    <span className={`pos ${o.position}`} style={{ flex: 'none' }}>
                      {o.position}
                    </span>
                  )}
                  <strong>{o.name}</strong>
                </div>
              </td>
              <td className="num nowrap">
                R{o.keepRound} <span className="muted small">· pick {o.keepPick}</span>
              </td>
              <td className="num">{fmt1(o.adp)}</td>
              <td
                className={`num nowrap ${(o.draftValue ?? 0) > 0 ? 'success' : (o.draftValue ?? 0) < 0 ? 'error' : ''}`}
              >
                {fmt1(o.draftValue, true)}
              </td>
              <td className="num nowrap">
                {fmt1(o.points)}
                <div className="muted small">
                  {o.weeksStarted}/{o.weeksRostered} wks started
                </div>
              </td>
              <td className="num nowrap">
                {o.finishRank === null ? '—' : `${ordinal(o.finishRank)} of ${o.draftedCount}`}
                {o.positionFinish !== null && o.position && (
                  <div className="muted small">
                    {o.position}
                    {o.positionFinish}
                  </div>
                )}
              </td>
              <td
                className={`num nowrap ${(o.performance ?? 0) > 0 ? 'success' : (o.performance ?? 0) < 0 ? 'error' : ''}`}
              >
                {fmt1(o.performance, true)}
              </td>
              <td className="num">{fmtPct(o.impactShare)}</td>
              <td className="nowrap">
                {o.teamRank === null ? '—' : ordinal(o.teamRank)}
                <div className="muted small">
                  {o.teamRecord}
                  {o.teamPlacement === 1
                    ? ' · champion'
                    : o.teamPlacement
                      ? ` · ${ordinal(o.teamPlacement)} in playoffs`
                      : ''}
                </div>
              </td>
              <td className={`num ${scoreClass(o.score)}`}>
                <strong>{o.score ?? '—'}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
