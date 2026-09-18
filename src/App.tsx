import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.tsx'
import { LeagueProvider } from './context/LeagueContext.tsx'
import { isConfigured } from './lib/supabase.ts'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import Layout from './components/Layout.tsx'
import Login from './pages/auth/Login.tsx'
import Signup from './pages/auth/Signup.tsx'
import PreseasonPage from './pages/preseason/PreseasonPage.tsx'
import StatsPage from './pages/stats/StatsPage.tsx'
import StandingsPage from './pages/standings/StandingsPage.tsx'
import TeamPage from './pages/team/TeamPage.tsx'
import SettingsPage from './pages/settings/SettingsPage.tsx'

function NotConfigured() {
  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <h1>Almost there</h1>
        <p>
          The site is not connected to Supabase yet. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (in <code>.env</code> locally, or as repository
          variables for the GitHub Pages deploy) and rebuild. See the README for the full setup.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (!isConfigured) return <NotConfigured />
  if (loading) return <div className="loading">Loading…</div>

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <LeagueProvider>
      <ErrorBoundary>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/history" replace />} />
            <Route path="/preseason/*" element={<PreseasonPage />} />
            <Route path="/stats/*" element={<StatsPage />} />
            <Route path="/history" element={<StandingsPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings/*" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/history" replace />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </LeagueProvider>
  )
}
