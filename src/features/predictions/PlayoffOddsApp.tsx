import NeedsLeague from '../../components/NeedsLeague.tsx'
import { useLeague } from '../../context/LeagueContext.tsx'
import LineupPlanner from './components/LineupPlanner.tsx'
import OddsTable from './components/OddsTable.tsx'
import WeekMatchups from './components/WeekMatchups.tsx'
import { PLAYER_CV } from './engine/index.ts'
import { SIMULATION_RUNS, usePredictions } from './usePredictions.ts'

/** Playoff odds, this week's matchups and bye-week lineups for the current season. */
export default function PlayoffOddsApp() {
  const { settings, me } = useLeague()
  const leagueId = settings?.sleeper_league_id ?? null
  const { loading, progress, error, data, result, clinch, strength, refresh } =
    usePredictions(leagueId)

  if (!leagueId) return <NeedsLeague />
  if (error) {
    return (
      <div className="banner error">
        Could not load projections from Sleeper: {error}{' '}
        <button type="button" className="small" onClick={refresh}>
          Retry
        </button>
      </div>
    )
  }
  if (loading || !data || !result) return <div className="loading">{progress ?? 'Loading…'}</div>

  const played = data.playedWeeks.length
  const remaining = data.remainingWeeks.length
  const seasonOver = remaining === 0
  const nextWeek = data.remainingWeeks[0] ?? null
  const myOwnerId = me?.sleeper_user_id ?? null

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h2 style={{ margin: 0 }}>
            {data.season} ·{' '}
            {seasonOver
              ? 'Regular season complete'
              : `${remaining} week${remaining === 1 ? '' : 's'} to play`}
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            {played} of {data.lastRegularWeek} regular-season weeks final
            {data.inProgressWeek ? ` · week ${data.inProgressWeek} in progress` : ''}
            {' · '}
            {data.playoffTeams} playoff spots
            {result.byes > 0 ? ` (${result.byes} bye${result.byes === 1 ? '' : 's'})` : ''}
            {data.medianGame ? ' · league median game on' : ''}
          </p>
        </div>
        <button type="button" className="small" onClick={refresh}>
          Refresh
        </button>
      </div>

      {data.missingProjectionWeeks.length > 0 && (
        <div className="banner warn">
          Sleeper has no projections yet for week
          {data.missingProjectionWeeks.length === 1 ? ' ' : 's '}
          {data.missingProjectionWeeks.join(', ')}. Those weeks use each team&apos;s average
          projection instead.
        </div>
      )}
      {!data.scoringKnown && (
        <div className="banner warn">
          Sleeper did not return the league&apos;s scoring settings, so projections use
          Sleeper&apos;s default point totals.
        </div>
      )}
      {data.divisions > 0 && (
        <div className="banner">
          This league has {data.divisions} divisions. Seeding here ignores them and ranks every team
          by record, then points for.
        </div>
      )}

      <section className="card">
        <div className="card-header">
          <h2>Playoff odds</h2>
          <span className="muted small">{SIMULATION_RUNS.toLocaleString()} simulated seasons</span>
        </div>
        {seasonOver ? (
          <p className="muted small">
            The regular season is over: seeds are final and the odds are for the bracket
            {data.bracket ? ', with games already played locked in' : ''}.
          </p>
        ) : null}
        <OddsTable
          data={data}
          result={result}
          clinch={clinch}
          strength={strength}
          highlightOwnerId={myOwnerId}
        />
        <p className="muted small" style={{ margin: '0.6rem 0 0' }}>
          <strong>Status</strong>: Clinched and Out are exact, worked out from every possible
          combination of remaining results on wins alone (a tie on wins is treated as a loss, since
          points for cannot be known in advance). M is the magic number: wins, or losses by the team
          that would take the last spot, that clinch a place. E is the elimination number: losses,
          or wins by the team holding the last spot, that end the season.{' '}
          <strong>Opp. proj.</strong> is the average projected score of the remaining opponents,
          higher meaning a harder schedule.
        </p>
      </section>

      {nextWeek !== null && (
        <section className="card">
          <div className="card-header">
            <h2>
              Week {nextWeek}
              {nextWeek === data.inProgressWeek ? ' (in progress)' : ''}
            </h2>
            <span className="muted small">Projected scores and win probability</span>
          </div>
          <WeekMatchups data={data} week={nextWeek} highlightOwnerId={myOwnerId} />
        </section>
      )}

      {(data.remainingWeeks.length > 0 || data.playoffWeeks.length > 0) && (
        <section className="card">
          <div className="card-header">
            <h2>Optimal lineups and bye weeks</h2>
            <span className="muted small">
              Best possible starters from Sleeper&apos;s projections
            </span>
          </div>
          <LineupPlanner data={data} defaultOwnerId={myOwnerId} />
        </section>
      )}

      <details className="card">
        <summary>How the odds are computed</summary>
        <ul className="small muted" style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
          <li>
            Every remaining week, each team is assumed to start its best possible lineup from
            Sleeper&apos;s weekly player projections, scored with this league&apos;s own scoring
            settings. Players on bye or on IR / taxi are left out, so bye weeks lower a team&apos;s
            projection on their own.
          </li>
          <li>
            A team&apos;s weekly score is drawn around that projection: each starter varies by about{' '}
            {Math.round(PLAYER_CV * 100)}% of their projection, which works out to roughly ±20–25
            points for a full lineup.
          </li>
          <li>
            {SIMULATION_RUNS.toLocaleString()} seasons are played out from the current standings
            using the real remaining schedule
            {data.medianGame ? ', including the weekly game against the league median' : ''}. Seeds
            are decided by record, then points for. Odds are the share of seasons in which each
            outcome happened.
          </li>
          <li>
            A week in progress counts as unplayed: partial scores are ignored until Sleeper moves to
            the next week.
          </li>
        </ul>
      </details>
    </div>
  )
}
