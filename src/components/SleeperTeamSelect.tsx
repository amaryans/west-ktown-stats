import { useLeague } from '../context/LeagueContext.tsx'
import { teamLabel } from '../lib/sleeper/league.ts'

/** Pick a Sleeper team from the league linked in Settings. Claimed teams are marked. */
export default function SleeperTeamSelect({
  id,
  value,
  onChange,
  disabled,
  allowClaimed = false,
}: {
  id?: string
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  /** Commissioners re-linking members may pick a team someone else holds. */
  allowClaimed?: boolean
}) {
  const { sleeper, profiles, me } = useLeague()
  const teams = sleeper.data?.teams ?? []
  const claimedBy = new Map(
    profiles.filter((p) => p.sleeper_user_id).map((p) => [p.sleeper_user_id, p]),
  )
  return (
    <select
      id={id}
      value={value ?? ''}
      disabled={disabled || !teams.length}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{teams.length ? 'Not linked' : 'Sleeper not linked'}</option>
      {teams
        .filter((t) => t.userId)
        .map((t) => {
          const owner = claimedBy.get(t.userId)
          const takenByOther = owner && owner.id !== me?.id && t.userId !== value
          return (
            <option
              key={t.userId}
              value={t.userId ?? ''}
              disabled={Boolean(takenByOther) && !allowClaimed}
            >
              {teamLabel(t)}
              {takenByOther ? ` (claimed by ${owner.display_name})` : ''}
            </option>
          )
        })}
    </select>
  )
}
