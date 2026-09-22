import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.tsx'
import SubTabs from '../../components/SubTabs.tsx'
import StandingsHistory from './StandingsHistory.tsx'
const PlayoffOddsApp = lazy(() => import('../../features/predictions/PlayoffOddsApp.tsx'))

export default function StandingsPage() {
  return (
    <>
      <PageHeader
        title="Standings"
        lede="Every season's regular-season standings, and where this season is headed."
      />
      <SubTabs
        label="Standings sections"
        tabs={[
          { to: '/history', label: 'History', end: true },
          { to: '/history/odds', label: 'Playoff Odds' },
        ]}
      />
      <Routes>
        <Route index element={<StandingsHistory />} />
        <Route
          path="odds"
          element={
            <Suspense fallback={<div className="loading">Loading…</div>}>
              <PlayoffOddsApp />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/history" replace />} />
      </Routes>
    </>
  )
}
