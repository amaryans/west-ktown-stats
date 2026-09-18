import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import NeedsLeague from '../../components/NeedsLeague.tsx'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import type { SavedKeeperList } from '../../features/keepers/KeepersApp.tsx'
import { loadLeagueChain } from '../../features/standings/history.ts'
import { REPO_URL } from '../../lib/config.ts'
import { loadPlayers, playerName, type PlayersDump } from '../../lib/players.ts'
import { sleeper, type SleeperLeague } from '../../lib/sleeper/client.ts'

const KeepersApp = lazy(() => import('../../features/keepers/KeepersApp.tsx'))

export default function KeepersTab() {
  const { settings, keeperLists, isCommissioner, nameOf, upsertKeeperList } = useLeague()
  const leagueId = settings?.sleeper_league_id ?? null

  // Every season in the league's Sleeper history (newest first), so keepers
  // can be recorded for earlier years, not just the most recent one.
  const [chain, setChain] = useState<{
    loading: boolean
    error: string | null
    leagues: SleeperLeague[]
  }>({
    loading: false,
    error: null,
    leagues: [],
  })
  useEffect(() => {
    if (!leagueId) return
    let active = true
    setChain({ loading: true, error: null, leagues: [] })
    loadLeagueChain(sleeper, leagueId, () => undefined)
      .then((leagues) => {
        if (active) setChain({ loading: false, error: null, leagues })
      })
      .catch((err: unknown) => {
        if (active) setChain({ loading: false, error: errorMessage(err), leagues: [] })
      })
    return () => {
      active = false
    }
  }, [leagueId])

  // Seasons whose keepers can be recorded: finished ones, plus the current
  // season once its draft has been held (Sleeper marks the draft complete).
  const [draftedIds, setDraftedIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    const pending = chain.leagues.filter((l) => l.status !== 'complete')
    if (pending.length === 0) return
    let active = true
    Promise.all(
      pending.map((l) =>
        sleeper
          .getDrafts(l.league_id)
          .then((drafts) => (drafts.some((d) => d.status === 'complete') ? l.league_id : null))
          .catch(() => null),
      ),
    ).then((ids) => {
      if (active) setDraftedIds(new Set(ids.filter((id): id is string => id !== null)))
    })
    return () => {
      active = false
    }
  }, [chain.leagues])
  const completed = useMemo(
    () => chain.leagues.filter((l) => l.status === 'complete' || draftedIds.has(l.league_id)),
    [chain.leagues, draftedIds],
  )
  const [chosenLeagueId, setChosenLeagueId] = useState<string | null>(null)
  // Default to the most recent completed season (the one the upcoming draft reads from).
  const activeLeague = completed.find((l) => l.league_id === chosenLeagueId) ?? completed[0] ?? null

  const savedLists = useMemo<SavedKeeperList[]>(
    () =>
      keeperLists.map((k) => ({
        season: k.season,
        playerIds: k.player_ids,
        savedBy: k.updated_by ? nameOf(k.updated_by) : null,
      })),
    [keeperLists, nameOf],
  )

  if (!leagueId) return <NeedsLeague />

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Keeper eligibility per the{' '}
        <a href={`${REPO_URL}/blob/main/docs/keeper-rules.md`} target="_blank" rel="noreferrer">
          league rules
        </a>
        : confirm who was kept in a season, then tick players on each team&apos;s board to test
        combinations for the following draft.{' '}
        {isCommissioner
          ? 'Save each season’s keeper list so everyone works from the same one.'
          : 'The commissioner saves the confirmed lists for everyone.'}
      </p>

      <SavedKeepersOverview />

      {chain.loading && <div className="loading">Finding the league&apos;s seasons…</div>}
      {chain.error && (
        <div className="banner error">Could not read the league from Sleeper: {chain.error}</div>
      )}
      {!chain.loading && !chain.error && completed.length === 0 && (
        <div className="banner warn">
          No completed season found for this league yet, so there is nothing to record keepers for.
        </div>
      )}

      {activeLeague && (
        <>
          <div className="card row between" style={{ gap: '0.75rem' }}>
            <label className="row" style={{ margin: 0, gap: '0.5rem' }}>
              <span className="small muted">Keepers used in</span>
              <select
                aria-label="Season"
                style={{ width: 'auto' }}
                value={activeLeague.league_id}
                onChange={(e) => setChosenLeagueId(e.target.value)}
              >
                {completed.map((l) => {
                  const saved = savedLists.find((s) => s.season === Number(l.season))
                  return (
                    <option key={l.league_id} value={l.league_id}>
                      {l.season} season{l.status !== 'complete' ? ' (drafted)' : ''}
                      {saved ? ` · ${saved.playerIds.length} saved` : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <span className="small muted">
              {activeLeague.status === 'complete'
                ? `Sets up the ${Number(activeLeague.season) + 1} draft boards. Pick an earlier year to record who was kept then.`
                : `The ${activeLeague.season} draft is done: record who was kept in it. The boards it sets up are for ${Number(activeLeague.season) + 1}.`}
            </span>
          </div>
          <Suspense fallback={<div className="loading">Loading keepers…</div>}>
            <KeepersApp
              key={activeLeague.league_id}
              leagueId={activeLeague.league_id}
              exact={activeLeague.status !== 'complete'}
              savedLists={savedLists}
              canSave={isCommissioner}
              onSave={(list) =>
                upsertKeeperList({
                  season: list.season,
                  sleeper_league_id: list.sleeperLeagueId,
                  player_ids: list.playerIds,
                })
              }
            />
          </Suspense>
        </>
      )}
    </div>
  )
}

/** Every saved keeper list, with player names from the Sleeper player database. */
function SavedKeepersOverview() {
  const { keeperLists, nameOf } = useLeague()
  const [players, setPlayers] = useState<PlayersDump | null>(null)
  useEffect(() => {
    if (keeperLists.length === 0) return
    let active = true
    loadPlayers()
      .then((dump) => {
        if (active) setPlayers(dump)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [keeperLists.length])

  if (keeperLists.length === 0) return null
  const lists = [...keeperLists].sort((a, b) => b.season - a.season)
  return (
    <div className="card">
      <h2>Saved keeper lists</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Season</th>
              <th>Kept players</th>
              <th>Saved by</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((k) => (
              <tr key={k.id}>
                <td className="nowrap">{k.season}</td>
                <td>
                  {k.player_ids.length === 0 ? (
                    <span className="muted">none</span>
                  ) : (
                    k.player_ids
                      .map((id) => (players ? playerName(players[id], id) : id))
                      .sort((a, b) => a.localeCompare(b))
                      .join(', ')
                  )}
                </td>
                <td className="nowrap muted small">
                  {nameOf(k.updated_by)} · {new Date(k.updated_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
