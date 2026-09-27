import { useMemo, useSyncExternalStore } from 'react'
import { useLeague } from '../context/LeagueContext.tsx'
import { activeOwnerIds } from '../features/standings/active.ts'

// One setting for the whole site, remembered in this browser.
const KEY = 'wkt.activeOnly'
const EVENT = 'wkt:activeOnly'

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function setActiveOnly(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: the toggle still works until reload */
  }
  window.dispatchEvent(new Event(EVENT))
}

/**
 * Whether "active members only" is on, and `keep(ownerId)` to test a row.
 * Active members are the managers in the league's current season.
 */
export function useActiveFilter() {
  const activeOnly = useSyncExternalStore(subscribe, read, () => false)
  const { history } = useLeague()
  const active = useMemo(() => (history.data ? activeOwnerIds(history.data) : null), [history.data])
  const keep = useMemo(
    () => (ownerId: string | null | undefined) =>
      !activeOnly || !active || (ownerId != null && active.has(ownerId)),
    [activeOnly, active],
  )
  return { activeOnly, keep }
}

/** The "Active members only" switch. */
export function ActiveOnlyToggle() {
  const { activeOnly } = useActiveFilter()
  return (
    <label className="toggle" title="Hide managers who are not in the league this season">
      <input
        type="checkbox"
        checked={activeOnly}
        onChange={(e) => setActiveOnly(e.target.checked)}
      />
      <span className="toggle__track" aria-hidden="true" />
      <span className="toggle__label">Active members only</span>
    </label>
  )
}
