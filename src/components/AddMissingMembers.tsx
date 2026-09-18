import { useState } from 'react'
import { errorMessage, useLeague } from '../context/LeagueContext.tsx'

/**
 * Commissioner prompt to list Sleeper teams nobody has signed up for yet as
 * placeholder members, so the whole league shows in the parlay tables.
 */
export default function AddMissingMembers({ compact = false }: { compact?: boolean }) {
  const { isCommissioner, unlistedSleeperTeams, addPlaceholderMembers } = useLeague()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isCommissioner || unlistedSleeperTeams.length === 0) return null
  const n = unlistedSleeperTeams.length
  const names = unlistedSleeperTeams.map((t) => t.teamName ?? t.displayName)

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await addPlaceholderMembers(
        unlistedSleeperTeams.map((t) => ({
          display_name: t.displayName,
          team_name: t.teamName,
          sleeper_user_id: t.userId,
        })),
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={compact ? 'banner small' : 'banner'}>
      <div className="row between">
        <span>
          {n} Sleeper team{n === 1 ? ' is' : 's are'} not listed as members yet
          {compact ? '' : `: ${names.join(', ')}`}. Add them now so they appear in every parlay
          week; each one merges into the real account when that person signs up.
        </span>
        <button type="button" className="small primary" disabled={busy} onClick={() => void add()}>
          {busy ? 'Adding…' : `Add ${n} member${n === 1 ? '' : 's'}`}
        </button>
      </div>
      {error && <div className="error small mt">{error}</div>}
    </div>
  )
}
