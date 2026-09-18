import { Link } from 'react-router-dom'
import { useLeague } from '../context/LeagueContext.tsx'

/** Shown by tabs that need the Sleeper league linked in Settings. */
export default function NeedsLeague() {
  const { isCommissioner } = useLeague()
  return (
    <div className="card">
      <h2>Link the league to Sleeper</h2>
      <p className="muted">
        This page reads from the league&apos;s Sleeper history.{' '}
        {isCommissioner ? (
          <>
            Paste the Sleeper league ID in <Link to="/settings/league">Settings → League</Link> to
            turn it on.
          </>
        ) : (
          'Ask the commissioner to paste the Sleeper league ID in Settings.'
        )}
      </p>
    </div>
  )
}
