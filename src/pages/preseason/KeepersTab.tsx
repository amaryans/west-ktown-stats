import { lazy, Suspense, useMemo } from 'react'
import NeedsLeague from '../../components/NeedsLeague.tsx'
import { useLeague } from '../../context/LeagueContext.tsx'
import type { SavedKeeperList } from '../../features/keepers/KeepersApp.tsx'
import { REPO_URL } from '../../lib/config.ts'

const KeepersApp = lazy(() => import('../../features/keepers/KeepersApp.tsx'))

export default function KeepersTab() {
  const { settings, keeperLists, isCommissioner, nameOf, upsertKeeperList } = useLeague()
  const leagueId = settings?.sleeper_league_id ?? null

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
        : confirm who was kept last season, then tick players on each team&apos;s board to test
        combinations.{' '}
        {isCommissioner
          ? 'Save the keeper list so everyone works from the same one.'
          : 'The commissioner saves the confirmed list for everyone.'}
      </p>
      <Suspense fallback={<div className="loading">Loading keepers…</div>}>
        <KeepersApp
          leagueId={leagueId}
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
    </div>
  )
}
