import { useLeague } from '../context/LeagueContext.tsx'
import { teamLabel } from '../lib/sleeper/league.ts'
import type { Profile } from '../lib/db.ts'

/** The signed-up main member of a Sleeper team other than `exceptId`, if any. */
export function mainMemberOf(
  profiles: readonly Profile[],
  sleeperUserId: string | null,
  exceptId?: string | null,
): Profile | undefined {
  if (!sleeperUserId) return undefined
  return profiles.find(
    (p) =>
      p.sleeper_user_id === sleeperUserId && !p.is_placeholder && !p.co_owner && p.id !== exceptId,
  )
}

/**
 * Pick a Sleeper team from the league linked in Settings. A team that already
 * has a main member can still be picked: the new member joins it as a co-owner.
 */
export default function SleeperTeamSelect({
  id,
  value,
  onChange,
  disabled,
  memberId,
}: {
  id?: string
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  /** Whose team this is (defaults to the signed-in member). */
  memberId?: string | null
}) {
  const { sleeper, profiles, me } = useLeague()
  const teams = sleeper.data?.teams ?? []
  const self = memberId ?? me?.id ?? null
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
          const main = mainMemberOf(profiles, t.userId, self)
          return (
            <option key={t.userId} value={t.userId ?? ''}>
              {teamLabel(t)}
              {main ? ` (co-owner with ${main.display_name})` : ''}
            </option>
          )
        })}
    </select>
  )
}
