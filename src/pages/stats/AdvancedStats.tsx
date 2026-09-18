import { Navigate, Route, Routes } from 'react-router-dom'
import SubTabs from '../../components/SubTabs.tsx'
import KeeperSuccess from './KeeperSuccess.tsx'

/** Derived, league-history statistics; each gets its own sub-section here. */
export default function AdvancedStats() {
  return (
    <div className="stack">
      <SubTabs
        label="Advanced stats"
        tabs={[{ to: '/stats/advanced/keepers', label: 'Keeper success' }]}
      />
      <Routes>
        <Route path="keepers" element={<KeeperSuccess />} />
        <Route path="*" element={<Navigate to="/stats/advanced/keepers" replace />} />
      </Routes>
    </div>
  )
}
