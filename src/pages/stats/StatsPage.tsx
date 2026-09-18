import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.tsx'
import SubTabs from '../../components/SubTabs.tsx'
import AllTime from './AllTime.tsx'
import ManualStats from './ManualStats.tsx'
import Suggestions from './Suggestions.tsx'

export default function StatsPage() {
  return (
    <>
      <PageHeader
        title="Stats"
        lede="League-wide numbers from Sleeper, stats entered by hand from NFL.com, and a place to ask for more."
      />
      <SubTabs
        label="Stats sections"
        tabs={[
          { to: '/stats', label: 'All-time', end: true },
          { to: '/stats/manual', label: 'Manual stats' },
          { to: '/stats/suggest', label: 'Suggest a stat' },
        ]}
      />
      <Routes>
        <Route index element={<AllTime />} />
        <Route path="manual" element={<ManualStats />} />
        <Route path="suggest" element={<Suggestions />} />
        <Route path="*" element={<Navigate to="/stats" replace />} />
      </Routes>
    </>
  )
}
