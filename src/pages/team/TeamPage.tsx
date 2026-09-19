import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../../components/Avatar.tsx'
import HistoryStatus from '../../components/HistoryStatus.tsx'
import NeedsLeague from '../../components/NeedsLeague.tsx'
import PageHeader from '../../components/PageHeader.tsx'
import SleeperTeamSelect from '../../components/SleeperTeamSelect.tsx'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import { careers, type OwnerCareer, type OwnerSeason } from '../../features/standings/alltime.ts'
import { fmtPts, recordSortValue } from '../../features/standings/SeasonTable.tsx'
import { formatRecord } from '../../features/standings/standings.ts'
import { loadPlayers, playerName, type PlayersDump } from '../../lib/players.ts'
import { loadLeagueChain } from '../../features/standings/history.ts'
const KeeperValuePanel = lazy(() => import('../../features/keepers/KeeperValuePanel.tsx'))
import { sleeper as sleeper_client, type SleeperLeague } from '../../lib/sleeper/client.ts'
import {
  loadSleeperLeagueCached,
  type SleeperLeagueInfo,
  type SleeperTeam,
} from '../../lib/sleeper/league.ts'

export default function TeamPage() {
  const { me, settings, sleeper, profiles } = useLeague()
  const [viewUserId, setViewUserId] = useState<string | null>(null)
  const ownerId = viewUserId ?? me?.sleeper_user_id ?? null
  const leagueId = settings?.sleeper_league_id ?? null

  // Every season in the league's history, so past rosters can be browsed.
  const [chain, setChain] = useState<SleeperLeague[]>([])
  useEffect(() => {
    if (!leagueId) return
    let active = true
    loadLeagueChain(sleeper_client, leagueId, () => undefined)
      .then((leagues) => {
        if (active) setChain(leagues)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [leagueId])
  const [seasonLeagueId, setSeasonLeagueId] = useState<string | null>(null)
  const isCurrentSeason = !seasonLeagueId || seasonLeagueId === leagueId
  const [past, setPast] = useState<AsyncSeason>({ loading: false, error: null, info: null })
  useEffect(() => {
    if (isCurrentSeason || !seasonLeagueId) {
      setPast({ loading: false, error: null, info: null })
      return
    }
    let active = true
    setPast({ loading: true, error: null, info: null })
    loadSleeperLeagueCached(seasonLeagueId)
      .then((info) => {
        if (active) setPast({ loading: false, error: null, info })
      })
      .catch((err: unknown) => {
        if (active) setPast({ loading: false, error: errorMessage(err), info: null })
      })
    return () => {
      active = false
    }
  }, [seasonLeagueId, isCurrentSeason])

  if (!settings?.sleeper_league_id) {
    return (
      <>
        <PageHeader title="Team" />
        <NeedsLeague />
      </>
    )
  }

  const seasonInfo = isCurrentSeason ? sleeper.data : past.info
  const team = seasonInfo?.teams.find((t) => t.userId === ownerId) ?? null
  const isMine = ownerId === me?.sleeper_user_id

  return (
    <>
      <PageHeader
        title={isMine ? 'My team' : (team?.teamName ?? team?.displayName ?? 'Team')}
        lede={
          isMine
            ? 'Your current roster, this season so far, and your history in the league.'
            : undefined
        }
      >
        {chain.length > 1 && (
          <label className="row" style={{ margin: 0, gap: '0.4rem' }}>
            <span className="small muted">Season</span>
            <select
              aria-label="Season"
              style={{ width: 'auto' }}
              value={seasonLeagueId ?? leagueId ?? ''}
              onChange={(e) => setSeasonLeagueId(e.target.value)}
            >
              {chain.map((l) => (
                <option key={l.league_id} value={l.league_id}>
                  {l.season}
                  {l.league_id === leagueId ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {sleeper.data && (
          <label className="row" style={{ margin: 0, gap: '0.4rem' }}>
            <span className="small muted">View</span>
            <select
              aria-label="View another team"
              style={{ width: 'auto' }}
              value={ownerId ?? ''}
              onChange={(e) => setViewUserId(e.target.value || null)}
            >
              {!me?.sleeper_user_id && <option value="">Pick a team</option>}
              {sleeper.data.teams
                .filter((t) => t.userId)
                .map((t) => (
                  <option key={t.userId} value={t.userId ?? ''}>
                    {t.userId === me?.sleeper_user_id ? '★ ' : ''}
                    {t.teamName ?? t.displayName}
                  </option>
                ))}
            </select>
          </label>
        )}
      </PageHeader>

      {!me?.sleeper_user_id && <ClaimTeamCard />}

      {(sleeper.loading || past.loading) && (
        <div className="loading">Loading the league from Sleeper…</div>
      )}
      {sleeper.error && (
        <div className="banner error">Could not reach Sleeper: {sleeper.error}</div>
      )}
      {past.error && <div className="banner error">Could not load that season: {past.error}</div>}

      {ownerId && seasonInfo && (
        <div className="stack">
          {team ? (
            <SeasonRoster team={team} info={seasonInfo} isCurrent={isCurrentSeason} />
          ) : (
            <div className="banner">
              This member was not in the {seasonInfo.season} Sleeper season.
            </div>
          )}
          <TeamHistory ownerId={ownerId} />
        </div>
      )}
      {!ownerId && sleeper.data && (
        <p className="muted small mt">
          Claim your team above, or pick any team from the list to browse its history.
          {profiles.length > 1 ? '' : ''}
        </p>
      )}
    </>
  )
}

function ClaimTeamCard() {
  const { updateProfile, sleeper } = useLeague()
  const [choice, setChoice] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function claim() {
    if (!choice) return
    setBusy(true)
    setMsg(null)
    try {
      await updateProfile({ sleeper_user_id: choice })
    } catch (err) {
      setMsg(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb">
      <h2>Claim your team</h2>
      <p className="muted small">
        Pick your Sleeper team so this tab shows your roster and history. You can change it later in{' '}
        <Link to="/settings">Settings</Link>.
      </p>
      <div className="row">
        <div style={{ flex: '1 1 240px' }}>
          <SleeperTeamSelect id="claim-team" value={choice} onChange={setChoice} />
        </div>
        <button
          type="button"
          className="primary"
          disabled={!choice || busy || !sleeper.data}
          onClick={() => void claim()}
        >
          {busy ? 'Saving…' : 'Claim team'}
        </button>
      </div>
      {msg && <div className="error small mt">{msg}</div>}
    </div>
  )
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF']

interface AsyncSeason {
  loading: boolean
  error: string | null
  info: SleeperLeagueInfo | null
}

function SeasonRoster({
  team,
  info,
  isCurrent,
}: {
  team: SleeperTeam
  info: SleeperLeagueInfo
  isCurrent: boolean
}) {
  const [players, setPlayers] = useState<PlayersDump | null>(null)
  const [playersError, setPlayersError] = useState<string | null>(null)
  const [view, setView] = useState<'roster' | 'keepers'>('roster')

  useEffect(() => {
    let active = true
    loadPlayers()
      .then((dump) => {
        if (active) setPlayers(dump)
      })
      .catch((err: unknown) => {
        if (active) setPlayersError(errorMessage(err))
      })
    return () => {
      active = false
    }
  }, [])

  const rankAmongTeams = useMemo(() => {
    const sorted = [...info.teams].sort(
      (a, b) =>
        winPctOf(b) - winPctOf(a) ||
        b.wins - a.wins ||
        b.pointsFor - a.pointsFor ||
        a.pointsAgainst - b.pointsAgainst,
    )
    return sorted.findIndex((t) => t.rosterId === team.rosterId) + 1
  }, [info, team.rosterId])

  const starters = new Set(team.starters)
  const reserve = new Set(team.reserve)
  const taxi = new Set(team.taxi)
  const bench = team.players.filter((p) => !starters.has(p) && !reserve.has(p) && !taxi.has(p))
  const gamesPlayed = team.wins + team.losses + team.ties
  const seasonLabel = isCurrent
    ? `${info.season} season`
    : `${info.season} season · end-of-season roster`

  return (
    <div className="card">
      <div className="card-header">
        <div className="team">
          <Avatar src={team.avatarUrl} name={team.teamName ?? team.displayName} size="lg" />
          <div className="team__names">
            <h2 className="team__name" style={{ fontSize: '1.25rem', margin: 0 }}>
              {team.teamName ?? team.displayName}
            </h2>
            <div className="team__owner">
              {team.displayName} · {seasonLabel}
              {info.status === 'pre_draft' ? ' (pre-draft)' : ''}
            </div>
          </div>
        </div>
      </div>
      <div className="stat-tiles">
        <div className="tile">
          <div className="label">Record</div>
          <div className="value">{formatRecord(team)}</div>
          {gamesPlayed > 0 && rankAmongTeams ? (
            <div className="sub">
              #{rankAmongTeams} of {info.teams.length}
            </div>
          ) : null}
        </div>
        <div className="tile">
          <div className="label">Points for</div>
          <div className="value">{fmtPts(team.pointsFor)}</div>
          {gamesPlayed > 0 && (
            <div className="sub">{fmtPts(team.pointsFor / gamesPlayed)} per game</div>
          )}
        </div>
        <div className="tile">
          <div className="label">Points against</div>
          <div className="value">{fmtPts(team.pointsAgainst)}</div>
        </div>
        <div className="tile">
          <div className="label">Roster</div>
          <div className="value">{team.players.length}</div>
          <div className="sub">
            {team.starters.length} starters · {bench.length} bench
            {team.reserve.length ? ` · ${team.reserve.length} IR` : ''}
          </div>
        </div>
      </div>

      <div className="subtabs mt" role="tablist" aria-label="Team view" style={{ marginBottom: 0 }}>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'roster'}
          className={view === 'roster' ? 'subtab active' : 'subtab'}
          onClick={() => setView('roster')}
        >
          Roster
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'keepers'}
          className={view === 'keepers' ? 'subtab active' : 'subtab'}
          onClick={() => setView('keepers')}
        >
          Keeper value
        </button>
      </div>

      {view === 'keepers' && (
        <div className="mt">
          <Suspense fallback={<div className="loading">Loading keeper value…</div>}>
            <KeeperValuePanel
              leagueId={info.leagueId}
              season={info.season}
              rosterId={team.rosterId}
              ownerId={team.userId}
              teamsCount={info.teams.length}
              isCurrent={isCurrent}
            />
          </Suspense>
        </div>
      )}

      {view === 'roster' && playersError && (
        <div className="banner warn mt small">
          Could not load player names from Sleeper ({playersError}).
        </div>
      )}
      {view === 'roster' && !players && !playersError && team.players.length > 0 && (
        <p className="muted small mt">Loading player names (cached for a day)…</p>
      )}
      {view === 'roster' && players && (
        <>
          <RosterGroup title="Starters" ids={team.starters} players={players} keepOrder />
          <RosterGroup title="Bench" ids={bench} players={players} />
          {team.reserve.length > 0 && (
            <RosterGroup title="Injured reserve" ids={team.reserve} players={players} />
          )}
          {team.taxi.length > 0 && (
            <RosterGroup title="Taxi squad" ids={team.taxi} players={players} />
          )}
        </>
      )}
    </div>
  )
}

function winPctOf(t: SleeperTeam): number {
  const games = t.wins + t.losses + t.ties
  return games === 0 ? 0 : (t.wins + t.ties / 2) / games
}

function RosterGroup({
  title,
  ids,
  players,
  keepOrder = false,
}: {
  title: string
  ids: string[]
  players: PlayersDump
  keepOrder?: boolean
}) {
  if (ids.length === 0) return null
  const rows = ids.map((id) => {
    const p = players[id]
    const position = p?.position ?? (/^[A-Z]{2,3}$/.test(id) ? 'DEF' : '?')
    return {
      id,
      name: playerName(p, /^[A-Z]{2,3}$/.test(id) ? `${id} D/ST` : id),
      position,
      nflTeam: p?.team ?? (position === 'DEF' ? id : null),
      injury: p?.injury_status ?? null,
    }
  })
  if (!keepOrder) {
    rows.sort(
      (a, b) =>
        positionIndex(a.position) - positionIndex(b.position) || a.name.localeCompare(b.name),
    )
  }
  return (
    <div className="mt">
      <h3
        className="muted"
        style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        {title}
      </h3>
      <ul className="roster">
        {rows.map((r) => (
          <li key={r.id}>
            <span className={`pos ${r.position}`}>{r.position}</span>
            <span className="pname">
              {r.name}
              {r.injury ? <span className="muted small"> · {r.injury}</span> : null}
            </span>
            <span className="pteam">{r.nflTeam ?? 'FA'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function positionIndex(position: string): number {
  const i = POSITION_ORDER.indexOf(position)
  return i === -1 ? POSITION_ORDER.length : i
}

function TeamHistory({ ownerId }: { ownerId: string }) {
  const { history } = useLeague()
  const career = useMemo<OwnerCareer | null>(
    () =>
      history.data ? (careers(history.data).find((c) => c.ownerId === ownerId) ?? null) : null,
    [history.data, ownerId],
  )
  const columns = useMemo<SortColumn<OwnerSeason>[]>(
    () => [
      { key: 'season', label: 'Season', get: (s) => Number(s.season), defaultDir: 'desc' },
      { key: 'team', label: 'Team', get: (s) => s.teamName },
      { key: 'record', label: 'Record', get: (s) => recordSortValue(s.h2h), className: 'num' },
      { key: 'median', label: 'vs Med', get: (s) => recordSortValue(s.median), className: 'num' },
      {
        key: 'rank',
        label: 'Rank',
        get: (s) => s.rank || null,
        defaultDir: 'asc',
        className: 'num',
      },
      { key: 'pf', label: 'PF', get: (s) => s.pointsFor, className: 'num' },
      { key: 'pa', label: 'PA', get: (s) => s.pointsAgainst, className: 'num' },
      { key: 'finish', label: 'Finish', get: (s) => s.playoffFinish, defaultDir: 'asc' },
    ],
    [],
  )
  const seasonRows = useMemo(() => career?.seasons ?? [], [career])
  const { sort, toggle, sorted } = useSortable(seasonRows, columns)

  return (
    <div className="card">
      <div className="card-header">
        <h2>History</h2>
        <Link to="/history" className="small">
          Full standings
        </Link>
      </div>
      <HistoryStatus />
      {history.data && !career && <p className="empty">No seasons found for this member.</p>}
      {career && (
        <>
          <div className="stat-tiles">
            <div className="tile">
              <div className="label">All-time</div>
              <div className="value">{formatRecord(career.h2h)}</div>
              <div className="sub">
                {career.seasonsPlayed} season{career.seasonsPlayed === 1 ? '' : 's'} ·{' '}
                {(career.winPct * 100).toFixed(1)}%
              </div>
            </div>
            <div className="tile">
              <div className="label">Titles</div>
              <div className="value">
                {career.championships > 0 ? `🏆 ${career.championships}` : '—'}
              </div>
              <div className="sub">
                {career.playoffAppearances} playoff finish
                {career.playoffAppearances === 1 ? '' : 'es'}
                {career.bestFinish ? ` · best ${ordinal(career.bestFinish)}` : ''}
              </div>
            </div>
            <div className="tile">
              <div className="label">vs Median</div>
              <div className="value">{formatRecord(career.median)}</div>
              <div className="sub">combined {formatRecord(career.combined)}</div>
            </div>
            <div className="tile">
              <div className="label">Best week</div>
              <div className="value">
                {career.highestWeek ? fmtPts(career.highestWeek.points) : '—'}
              </div>
              {career.highestWeek && (
                <div className="sub">
                  {career.highestWeek.season} · week {career.highestWeek.week}
                </div>
              )}
            </div>
          </div>
          <div className="table-wrap mt">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <SortableTh key={c.key} column={c} sort={sort} onToggle={toggle} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.leagueId}>
                    <td className="nowrap">{s.season}</td>
                    <td>{s.teamName}</td>
                    <td className="num nowrap">{formatRecord(s.h2h)}</td>
                    <td className="num nowrap">
                      {s.median.wins + s.median.losses + s.median.ties
                        ? formatRecord(s.median)
                        : '—'}
                    </td>
                    <td className="num">{s.rank ? `${s.rank}/${s.teamCount}` : '—'}</td>
                    <td className="num">{fmtPts(s.pointsFor)}</td>
                    <td className="num">{fmtPts(s.pointsAgainst)}</td>
                    <td className="nowrap">
                      {s.champion ? (
                        <span className="badge gold">Champion</span>
                      ) : s.playoffFinish ? (
                        ordinal(s.playoffFinish)
                      ) : s.complete ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className="badge">In progress</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}
