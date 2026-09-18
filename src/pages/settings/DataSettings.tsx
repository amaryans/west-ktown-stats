import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import { REPO_URL } from '../../lib/config.ts'

/** Commissioner view of the league-wide data other tabs publish. */
export default function DataSettings() {
  const { draftOrders, keeperLists, suggestions, nameOf, deleteDraftOrder, history } = useLeague()
  const [msg, setMsg] = useState<string | null>(null)

  async function act(fn: () => Promise<void>) {
    setMsg(null)
    try {
      await fn()
    } catch (err) {
      setMsg(errorMessage(err))
    }
  }

  function clearCaches() {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('wkt.') || key.startsWith('ffl.') || key.startsWith('keepers'))
          localStorage.removeItem(key)
      }
      indexedDB.deleteDatabase('west-ktown-stats')
      setMsg('Local caches cleared. Reload the page to fetch fresh data.')
    } catch (err) {
      setMsg(errorMessage(err))
    }
  }

  const queued = suggestions.filter((s) => s.status === 'new').length

  return (
    <div className="stack">
      {msg && <div className="banner small">{msg}</div>}
      <div className="card">
        <h2>Published draft orders</h2>
        {draftOrders.length === 0 ? (
          <p className="empty">
            Nothing published. Run the lottery under{' '}
            <Link to="/preseason/lottery">Preseason → Lottery</Link> and publish the result.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Source</th>
                  <th>Published by</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draftOrders.map((d) => (
                  <tr key={d.id}>
                    <td>{d.season}</td>
                    <td>
                      {d.lottery ? `Lottery (seed ${d.lottery.seedUsed})` : 'Entered by hand'}
                    </td>
                    <td>{nameOf(d.created_by)}</td>
                    <td className="nowrap">{new Date(d.updated_at).toLocaleDateString()}</td>
                    <td className="right">
                      <button
                        type="button"
                        className="small danger"
                        onClick={() => {
                          if (window.confirm(`Remove the published ${d.season} draft order?`))
                            void act(() => deleteDraftOrder(d.id))
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Saved keeper lists</h2>
        {keeperLists.length === 0 ? (
          <p className="empty">
            None saved. Confirm last season&apos;s keepers under{' '}
            <Link to="/preseason/keepers">Preseason → Keepers</Link>.
          </p>
        ) : (
          <ul>
            {keeperLists.map((k) => (
              <li key={k.id}>
                {k.season} season: {k.player_ids.length} keeper
                {k.player_ids.length === 1 ? '' : 's'} · saved by {nameOf(k.updated_by)}{' '}
                {new Date(k.updated_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Stat suggestions → GitHub issues</h2>
        <p className="muted small">
          {queued === 0
            ? 'No suggestions are waiting to be filed.'
            : `${queued} suggestion${queued === 1 ? ' is' : 's are'} waiting to be filed as GitHub issues.`}{' '}
          The <em>File stat suggestions</em> workflow runs every few hours and can be triggered by
          hand from the repository&apos;s Actions tab.
        </p>
        <a
          className="btn small"
          href={`${REPO_URL}/actions/workflows/file-stat-suggestions.yml`}
          target="_blank"
          rel="noreferrer"
        >
          Open the workflow ↗
        </a>
      </div>

      <div className="card">
        <h2>Local caches</h2>
        <p className="muted small">
          Completed seasons, the Sleeper player database and in-progress lottery state are cached in
          this browser. Clear them if something looks stale.
        </p>
        <div className="row">
          <button type="button" onClick={clearCaches}>
            Clear caches on this device
          </button>
          <button
            type="button"
            className="small"
            onClick={history.refresh}
            disabled={history.loading}
          >
            Reload standings history
          </button>
        </div>
      </div>
    </div>
  )
}
