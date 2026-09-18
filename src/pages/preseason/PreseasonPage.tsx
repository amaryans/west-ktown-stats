import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.tsx'
import SubTabs from '../../components/SubTabs.tsx'
import DraftOrderView from './DraftOrderView.tsx'
import LotteryTab from './LotteryTab.tsx'
import KeepersTab from './KeepersTab.tsx'

export default function PreseasonPage() {
  return (
    <>
      <PageHeader
        title="Preseason"
        lede="Draft order, the lottery that decides it, and who everyone can keep."
      />
      <SubTabs
        label="Preseason sections"
        tabs={[
          { to: '/preseason', label: 'Draft order', end: true },
          { to: '/preseason/lottery', label: 'Lottery' },
          { to: '/preseason/keepers', label: 'Keepers' },
        ]}
      />
      <Routes>
        <Route index element={<DraftOrderView />} />
        <Route path="lottery" element={<LotteryTab />} />
        <Route path="keepers" element={<KeepersTab />} />
        <Route path="*" element={<Navigate to="/preseason" replace />} />
      </Routes>
    </>
  )
}
