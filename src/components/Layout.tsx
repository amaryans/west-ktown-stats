import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { useLeague } from '../context/LeagueContext.tsx'

const TABS = [
  { to: '/preseason', label: 'Preseason', icon: '🎱' },
  { to: '/stats', label: 'Stats', icon: '📊' },
  { to: '/history', label: 'Standings', icon: '🏆' },
  { to: '/team', label: 'Team', icon: '🏈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Layout() {
  const { signOut } = useAuth()
  const { settings, me, loading, error, sleeper } = useLeague()
  const leagueName = settings?.league_name ?? 'West K-Town'

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/history" className="brand" aria-label={`${leagueName} home`}>
            {sleeper.data?.avatarUrl ? (
              <img className="brand-avatar" src={sleeper.data.avatarUrl} alt="" />
            ) : (
              <span aria-hidden="true">🏈</span>
            )}
            <span className="brand-name">{leagueName}</span>
          </NavLink>
          <div className="user">
            <span className="name">{me?.display_name}</span>
            <button type="button" className="small" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
        <nav className="tabs" aria-label="Main">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
            >
              <span className="tab-icon" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="tab-label">{tab.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="main">
        {error && (
          <div className="banner error mb">
            Could not load league data: {error.message}. Has <code>supabase/schema.sql</code> been
            run?
          </div>
        )}
        {loading && !error ? <div className="loading">Loading {leagueName}…</div> : <Outlet />}
      </main>
    </>
  )
}
