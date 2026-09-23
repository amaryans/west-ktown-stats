import { useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import HistoryStatus from '../../components/HistoryStatus.tsx'
import PageHeader from '../../components/PageHeader.tsx'
import SubTabs from '../../components/SubTabs.tsx'
import { useLeague } from '../../context/LeagueContext.tsx'
import { weeklySeasons } from '../../features/analytics/common.ts'
import type { LeagueHistory, SeasonStandings } from '../../features/standings/history.ts'
import Consistency from './Consistency.tsx'
import Execution from './Execution.tsx'
import Luck from './Luck.tsx'
import Positions from './Positions.tsx'
import PowerRankings from './PowerRankings.tsx'
import Records from './Records.tsx'
import Rivalries from './Rivalries.tsx'
import { ALL } from './shared.tsx'

export interface AnalyticsProps {
  history: LeagueHistory
  /** Seasons with weekly results, newest first. */
  seasons: SeasonStandings[]
  /** Selected season's league id, or ALL. Shared across the sub-pages. */
  scope: string
  setScope: (scope: string) => void
  /** The selected season, or the newest one when "All seasons" is selected. */
  season: SeasonStandings
  meOwnerId: string | null
}

export default function AnalyticsPage() {
  const { history, me } = useLeague()
  return (
    <>
      <PageHeader
        title="Analytics"
        lede="Power rankings, luck, consistency, lineup execution, the record book and rivalries — all worked out from every week's scores on Sleeper."
      />
      <SubTabs
        label="Analytics sections"
        tabs={[
          { to: '/analytics', label: 'Power rankings', end: true },
          { to: '/analytics/luck', label: 'Luck & all-play' },
          { to: '/analytics/consistency', label: 'Consistency' },
          { to: '/analytics/execution', label: 'Execution' },
          { to: '/analytics/positions', label: 'Positions & MVPs' },
          { to: '/analytics/records', label: 'Records & awards' },
          { to: '/analytics/rivalries', label: 'Rivalries' },
        ]}
      />
      <div className="stack">
        <HistoryStatus />
        {history.data && (
          <Sections history={history.data} meOwnerId={me?.sleeper_user_id ?? null} />
        )}
      </div>
    </>
  )
}

function Sections({ history, meOwnerId }: { history: LeagueHistory; meOwnerId: string | null }) {
  const seasons = useMemo(() => weeklySeasons(history), [history])
  // Default to the newest season that has games; early in a season that may be last year.
  const [chosen, setScope] = useState<string | null>(null)
  const fallback = seasons.find((s) => s.weeksPlayed.length > 0) ?? seasons[0]
  const scope =
    chosen === ALL || seasons.some((s) => s.leagueId === chosen)
      ? (chosen as string)
      : (fallback?.leagueId ?? ALL)
  const season = seasons.find((s) => s.leagueId === scope) ?? fallback

  if (!season) {
    return (
      <div className="card empty">
        No seasons with week-by-week results yet. These stats need Sleeper matchups; seasons entered
        by hand only have totals.
      </div>
    )
  }

  const props: AnalyticsProps = { history, seasons, scope, setScope, season, meOwnerId }
  return (
    <Routes>
      <Route index element={<PowerRankings {...props} />} />
      <Route path="luck" element={<Luck {...props} />} />
      <Route path="consistency" element={<Consistency {...props} />} />
      <Route path="execution" element={<Execution {...props} />} />
      <Route path="positions" element={<Positions {...props} />} />
      <Route path="records" element={<Records {...props} />} />
      <Route path="rivalries" element={<Rivalries {...props} />} />
      <Route path="*" element={<Navigate to="/analytics" replace />} />
    </Routes>
  )
}
