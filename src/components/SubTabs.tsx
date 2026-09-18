import { NavLink } from 'react-router-dom'

export interface SubTab {
  to: string
  label: string
  end?: boolean
}

/** Pill-style secondary navigation inside a tab (scrolls horizontally on phones). */
export default function SubTabs({ tabs, label }: { tabs: SubTab[]; label: string }) {
  return (
    <nav className="subtabs" aria-label={label}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => (isActive ? 'subtab active' : 'subtab')}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
