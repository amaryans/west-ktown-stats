import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.tsx'
import SubTabs from '../../components/SubTabs.tsx'
import { ParlayProvider, useParlay } from '../../features/parlay/ParlayContext.tsx'
import ThisWeek from '../../features/parlay/pages/ThisWeek.tsx'
import Weeks from '../../features/parlay/pages/Weeks.tsx'
import WeekDetail from '../../features/parlay/pages/WeekDetail.tsx'
import OddsBoard from '../../features/parlay/pages/OddsBoard.tsx'
import ParlayStats from '../../features/parlay/pages/ParlayStats.tsx'

export default function ParlayPage() {
  return (
    <>
      <PageHeader
        title="Loser parlay"
        lede="Lowest score of the week places a parlay on next week's slate; everyone else adds a leg."
      />
      <SubTabs
        label="Parlay sections"
        tabs={[
          { to: '/parlay', label: 'This week', end: true },
          { to: '/parlay/weeks', label: 'Weeks' },
          { to: '/parlay/board', label: 'Odds board' },
          { to: '/parlay/stats', label: 'Stats' },
        ]}
      />
      <ParlayProvider>
        <ParlayRoutes />
      </ParlayProvider>
    </>
  )
}

function ParlayRoutes() {
  const { loading, error } = useParlay()
  if (error)
    return (
      <div className="banner error">
        Could not load the parlay tables: {error.message}. Has section 3 of{' '}
        <code>supabase/schema.sql</code> been run?
      </div>
    )
  if (loading) return <div className="loading">Loading parlays…</div>
  return (
    <Routes>
      <Route index element={<ThisWeek />} />
      <Route path="weeks" element={<Weeks />} />
      <Route path="weeks/:season/:week" element={<WeekDetail />} />
      <Route path="board" element={<OddsBoard />} />
      <Route path="stats" element={<ParlayStats />} />
      <Route path="*" element={<Navigate to="/parlay" replace />} />
    </Routes>
  )
}
