import { lazy, Suspense, useCallback } from 'react'
import { useLeague } from '../../context/LeagueContext.tsx'
import type { PosterEntry } from '../../features/lottery/components/results/ResultsPoster.tsx'
import { useAppStore } from '../../features/lottery/state/store.ts'
import type { DraftOrderEntry } from '../../lib/db.ts'

// The lottery pulls in framer-motion, confetti and the image exporter; load it on demand.
const LotteryApp = lazy(() => import('../../features/lottery/LotteryApp.tsx'))

export default function LotteryTab() {
  const { settings, sleeper, isCommissioner, upsertDraftOrder } = useLeague()

  const publish = useCallback(
    async (entries: PosterEntry[]): Promise<string> => {
      const { league, result, lotteryConfig, settings: lotterySettings } = useAppStore.getState()
      if (!league || !result || !lotteryConfig || !settings)
        throw new Error('No completed lottery to publish')
      const sleeperUsers = sleeper.data?.raw.users ?? []
      const rows: DraftOrderEntry[] = entries.map(({ team, slot, seed }) => {
        const rosterId = league.source === 'sleeper' ? Number(team.id) : null
        const roster =
          rosterId !== null
            ? sleeper.data?.raw.rosters.find((r) => r.roster_id === rosterId)
            : undefined
        const ownerId = roster?.owner_id ?? null
        const user = sleeperUsers.find((u) => u.user_id === ownerId)
        return {
          slot,
          teamName: team.teamName,
          ownerName: team.ownerName,
          seed,
          sleeperRosterId: rosterId,
          // Roster ids repeat across seasons; match owners through the current season's users.
          sleeperUserId: user ? user.user_id : null,
          record: `${team.wins}-${team.losses}${team.ties > 0 ? `-${team.ties}` : ''}`,
          avatarUrl: team.avatarUrl?.startsWith('data:') ? null : team.avatarUrl,
        }
      })
      await upsertDraftOrder({
        season: settings.season,
        league_name: league.name,
        entries: rows,
        lottery: {
          seedUsed: result.seedUsed,
          timestamp: result.timestamp,
          pickOrder: result.pickOrder,
          oddsBps: lotteryConfig.oddsBps,
          slotMode: lotterySettings.slotMode,
        },
      })
      return `Published as the ${settings.season} draft order ✓`
    },
    [settings, sleeper.data, upsertDraftOrder],
  )

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Runs entirely in this browser and remembers where you were, so it survives a reload
        mid-event. Put it on the TV, press <kbd>Space</kbd> to reveal the next pick.
        {isCommissioner
          ? ' When it’s done, publish the order so everyone sees it on the Draft order tab.'
          : ''}
      </p>
      <Suspense fallback={<div className="loading">Loading the lottery…</div>}>
        <LotteryApp
          defaultLeagueId={settings?.sleeper_league_id ?? null}
          onPublish={isCommissioner ? publish : undefined}
        />
      </Suspense>
    </div>
  )
}
