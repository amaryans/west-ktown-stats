import { useLeague } from '../../context/LeagueContext.tsx'
import HistoryStatus from '../../components/HistoryStatus.tsx'
import SeasonSection from '../../features/standings/SeasonTable.tsx'

/** Every season's regular-season standings. */
export default function StandingsHistory() {
  const { history, me, sleeper } = useLeague()
  const data = history.data

  return (
    <>
      <HistoryStatus />
      {data && (
        <>
          <div className="row between mb">
            <div className="row">
              {sleeper.data?.avatarUrl && (
                <img className="avatar lg" src={sleeper.data.avatarUrl} alt="" />
              )}
              <div>
                <h2 style={{ margin: 0 }}>{data.current.name}</h2>
                <p className="muted small" style={{ margin: 0 }}>
                  {seasonSpan(data.seasons.map((s) => s.season))} · {data.current.total_rosters}{' '}
                  teams
                </p>
              </div>
            </div>
            <button
              type="button"
              className="small"
              onClick={history.refresh}
              disabled={history.loading}
            >
              Refresh
            </button>
          </div>
          {data.seasons.length > 1 && (
            <nav className="years" aria-label="Seasons">
              {data.seasons.map((s) => (
                <button
                  key={s.leagueId}
                  type="button"
                  className="years__link"
                  onClick={() =>
                    document
                      .getElementById(`season-${s.season}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                >
                  {s.season}
                </button>
              ))}
            </nav>
          )}
          {data.seasons.map((s) => (
            <SeasonSection key={s.leagueId} season={s} highlightOwnerId={me?.sleeper_user_id} />
          ))}
          <p className="muted small">
            Records are recomputed from each week&apos;s matchups, regular season only. &quot;vs
            Median&quot; counts a win each week you score above the league median and a loss below
            it. Sort order is win percentage, then points for.
          </p>
        </>
      )}
    </>
  )
}

export function seasonSpan(seasons: string[]): string {
  if (seasons.length === 0) return ''
  const first = seasons[seasons.length - 1]
  const last = seasons[0]
  const count = `${seasons.length} season${seasons.length === 1 ? '' : 's'}`
  return first === last ? `${count} · ${first}` : `${count} · ${first}–${last}`
}
