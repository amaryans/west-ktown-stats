import { useMemo, useState } from 'react'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import { knownManagers } from '../../features/standings/legacy.ts'
import { formatRecord } from '../../features/standings/standings.ts'
import type { LegacyTeam } from '../../lib/db.ts'
import {
  fetchManualHistory,
  mapManualHistory,
  type ImportedSeason,
} from '../../lib/sleeper/manualHistory.ts'

/**
 * Pulls the seasons the commissioner entered under League Settings → League
 * History in the Sleeper app into the past-seasons table. Sleeper only serves
 * that data to a signed-in user, so the commissioner pastes their Sleeper
 * token; it is used for the one request and never stored.
 */
export default function SleeperHistoryImport({
  sleeperYears,
  savedYears,
  onSaved,
}: {
  /** Years the Sleeper chain already covers (skipped). */
  sleeperYears: number[]
  /** Years already in the past-seasons table (replaced on save). */
  savedYears: number[]
  onSaved: (message: string) => void
}) {
  const { settings, history, profiles, upsertLegacySeason } = useLeague()
  const leagueId = settings?.sleeper_league_id ?? ''
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<'fetch' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seasons, setSeasons] = useState<ImportedSeason[] | null>(null)
  const [chosen, setChosen] = useState<Set<number>>(new Set())

  // Link imported teams to Sleeper accounts by the manager's or team's name.
  const managers = useMemo(() => {
    const list = knownManagers(history.data).filter((m) => m.sleeper)
    const seen = new Set(list.map((m) => m.ownerId))
    for (const p of profiles) {
      if (p.sleeper_user_id && !seen.has(p.sleeper_user_id)) {
        list.push({ ownerId: p.sleeper_user_id, ownerName: p.display_name, sleeper: true })
        seen.add(p.sleeper_user_id)
      }
    }
    const byName = new Map<string, string>()
    for (const m of list) byName.set(m.ownerName.trim().toLowerCase(), m.ownerId)
    for (const p of profiles) {
      if (p.sleeper_user_id && p.team_name)
        byName.set(p.team_name.trim().toLowerCase(), p.sleeper_user_id)
    }
    return byName
  }, [history.data, profiles])

  function linked(team: LegacyTeam): LegacyTeam {
    const id =
      managers.get(team.ownerName.trim().toLowerCase()) ??
      managers.get(team.teamName.trim().toLowerCase()) ??
      null
    return { ...team, sleeperUserId: id }
  }

  async function load() {
    if (!leagueId) return setError('Set the Sleeper league id under Settings → League first.')
    if (!token.trim()) return setError('Paste your Sleeper token first.')
    setBusy('fetch')
    setError(null)
    setSeasons(null)
    try {
      const raw = await fetchManualHistory(token, leagueId)
      const mapped = mapManualHistory(raw)
      setSeasons(mapped)
      setChosen(
        new Set(mapped.filter((s) => !sleeperYears.includes(s.season)).map((s) => s.season)),
      )
      if (mapped.length === 0)
        setError('Sleeper returned no League History seasons for this league.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!seasons) return
    const picked = seasons.filter((s) => chosen.has(s.season))
    if (picked.length === 0) return setError('Tick at least one season.')
    setBusy('save')
    setError(null)
    try {
      for (const s of picked) {
        await upsertLegacySeason({
          season: s.season,
          source: s.source,
          notes: s.notes,
          teams: s.teams.map(linked),
        })
      }
      setToken('')
      setSeasons(null)
      onSaved(
        `Imported ${picked.length} season${picked.length === 1 ? '' : 's'} from Sleeper: ${picked
          .map((s) => s.season)
          .join(', ')}.`,
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card stack">
      <div className="card-header">
        <h2>Import from Sleeper League History</h2>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Seasons entered in the Sleeper app under League Settings → League History can be pulled in
        here. Sleeper only shows that data to someone signed in, so this needs your Sleeper token
        for one request; it is not stored anywhere.
      </p>
      <details className="small">
        <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>
          How to copy your Sleeper token
        </summary>
        <ol style={{ marginTop: '0.4rem' }}>
          <li>
            In a desktop browser, sign in at <code>sleeper.com</code> and open your league.
          </li>
          <li>
            Open the browser&apos;s developer tools (F12, or right-click → Inspect) and pick the{' '}
            <strong>Network</strong> tab, then click around the league so requests appear.
          </li>
          <li>
            Click any request named <code>graphql</code>. Under <strong>Request Headers</strong>,
            find <code>authorization</code> and copy its whole value.
          </li>
          <li>
            Paste it below. The token expires eventually; if the import fails, copy a fresh one.
          </li>
        </ol>
      </details>
      <div className="row" style={{ alignItems: 'flex-end', gap: '0.5rem' }}>
        <div className="field" style={{ flex: 1, minWidth: '16rem' }}>
          <label htmlFor="sh-token">Sleeper token</label>
          <input
            id="sh-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="eyJ…"
          />
        </div>
        <button type="button" className="primary" onClick={load} disabled={busy !== null}>
          {busy === 'fetch' ? 'Fetching…' : 'Fetch seasons'}
        </button>
      </div>
      {error && <div className="banner error small">{error}</div>}

      {seasons && seasons.length > 0 && (
        <>
          <div className="stack">
            {seasons.map((s) => {
              const covered = sleeperYears.includes(s.season)
              const replacing = savedYears.includes(s.season)
              return (
                <div key={s.season} className="banner">
                  <label className="row" style={{ margin: 0, gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      disabled={covered}
                      checked={chosen.has(s.season) && !covered}
                      onChange={(e) =>
                        setChosen((c) => {
                          const next = new Set(c)
                          if (e.target.checked) next.add(s.season)
                          else next.delete(s.season)
                          return next
                        })
                      }
                    />
                    <strong>{s.season}</strong>
                    <span className="muted small">
                      {s.teams.length} team{s.teams.length === 1 ? '' : 's'}
                      {s.source ? ` · ${s.source}` : ''}
                      {covered
                        ? ' · Sleeper already has this year as a played season, skipped'
                        : ''}
                      {!covered && replacing ? ' · replaces the saved copy' : ''}
                    </span>
                  </label>
                  {s.teams.length > 0 && (
                    <ol
                      className="muted small"
                      style={{ margin: '0.4rem 0 0', paddingLeft: '1.6rem' }}
                    >
                      {s.teams.map((t, i) => {
                        const l = linked(t)
                        return (
                          <li key={i}>
                            {t.teamName || t.ownerName || `Team ${i + 1}`}
                            {t.ownerName && t.teamName ? ` (${t.ownerName})` : ''} ·{' '}
                            {formatRecord(t)} · {t.pointsFor} PF
                            {t.playoffFinish ? ` · finish ${t.playoffFinish}` : ''}
                            {l.sleeperUserId ? '' : ' · not linked to a Sleeper account'}
                          </li>
                        )
                      })}
                    </ol>
                  )}
                  {s.warnings.length > 0 && (
                    <div className="error small" style={{ marginTop: '0.4rem' }}>
                      Could not read: {s.warnings.join('; ')}. Save anyway and fix the rows with
                      Edit, or show the raw data below.
                    </div>
                  )}
                  <details className="small" style={{ marginTop: '0.4rem' }}>
                    <summary style={{ cursor: 'pointer' }}>Raw data from Sleeper</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem' }}>
                      {JSON.stringify(s.raw, null, 2)}
                    </pre>
                  </details>
                </div>
              )
            })}
          </div>
          <div className="row">
            <button type="button" className="primary" onClick={save} disabled={busy !== null}>
              {busy === 'save'
                ? 'Saving…'
                : `Save ${chosen.size} season${chosen.size === 1 ? '' : 's'}`}
            </button>
            <span className="muted small">
              Managers are linked to Sleeper accounts by name; anything unmatched can be set
              afterwards with Edit.
            </span>
          </div>
        </>
      )}
    </div>
  )
}
