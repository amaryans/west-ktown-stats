import { Navigate, Route, Routes } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.tsx'
import SubTabs from '../../components/SubTabs.tsx'
import { useLeague } from '../../context/LeagueContext.tsx'
import ProfileSettings from './ProfileSettings.tsx'
import LeagueSettingsForm from './LeagueSettings.tsx'
import MembersSettings from './MembersSettings.tsx'
import StatDefinitionsSettings from './StatDefinitionsSettings.tsx'
import DataSettings from './DataSettings.tsx'
import LegacySeasonsSettings from './LegacySeasonsSettings.tsx'

export default function SettingsPage() {
  const { isCommissioner } = useLeague()
  const tabs = [
    { to: '/settings', label: 'Profile', end: true },
    { to: '/settings/league', label: isCommissioner ? 'League' : 'League info' },
    ...(isCommissioner
      ? [
          { to: '/settings/members', label: 'Members' },
          { to: '/settings/stats', label: 'Stat definitions' },
          { to: '/settings/seasons', label: 'Past seasons' },
          { to: '/settings/data', label: 'Shared data' },
        ]
      : []),
  ]
  return (
    <>
      <PageHeader
        title="Settings"
        lede="Your profile and team claim, plus everything the commissioner needs to run the site."
      />
      <SubTabs label="Settings sections" tabs={tabs} />
      <Routes>
        <Route index element={<ProfileSettings />} />
        <Route path="league" element={<LeagueSettingsForm />} />
        {isCommissioner && <Route path="members" element={<MembersSettings />} />}
        {isCommissioner && <Route path="stats" element={<StatDefinitionsSettings />} />}
        {isCommissioner && <Route path="seasons" element={<LegacySeasonsSettings />} />}
        {isCommissioner && <Route path="data" element={<DataSettings />} />}
        <Route path="*" element={<Navigate to="/settings" replace />} />
      </Routes>
    </>
  )
}
