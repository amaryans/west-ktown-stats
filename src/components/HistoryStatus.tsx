import { useEffect } from 'react'
import { useLeague } from '../context/LeagueContext.tsx'
import NeedsLeague from './NeedsLeague.tsx'

/**
 * Kicks off the (lazy) league-history load and renders its loading / error
 * states. Returns null once history is ready so the page can render it.
 */
export default function HistoryStatus() {
  const { settings, history } = useLeague()
  const load = history.load
  useEffect(() => {
    load()
  }, [load])

  if (!settings?.sleeper_league_id) return <NeedsLeague />
  if (history.error) {
    return (
      <div className="banner error">
        Could not load the league from Sleeper: {history.error}{' '}
        <button type="button" className="small" onClick={history.refresh}>
          Retry
        </button>
      </div>
    )
  }
  if (!history.data) return <div className="loading">{history.progress ?? 'Loading…'}</div>
  return null
}
