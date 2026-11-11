import { useLeague } from '../context/LeagueContext.tsx'
import type { Profile } from '../lib/db.ts'
import SleeperTeamSelect, { mainMemberOf } from './SleeperTeamSelect.tsx'

export interface TeamClaim {
  sleeperUserId: string | null
  coOwner: boolean
}

/**
 * A Sleeper team picker plus the co-owner switch. Picking a team that already
 * has a main member makes this member a co-owner (they keep their own account
 * and parlay leg); otherwise they can say they co-own it, so the main owner
 * can still claim it later.
 */
export default function TeamClaimFields({
  id,
  value,
  onChange,
  memberId,
}: {
  id: string
  value: TeamClaim
  onChange: (value: TeamClaim) => void
  /** Whose claim this is (defaults to the signed-in member). */
  memberId?: string | null
}) {
  const { profiles, me } = useLeague()
  const main = mainMemberOf(profiles, value.sleeperUserId, memberId ?? me?.id)
  const coOwner = Boolean(value.sleeperUserId) && (value.coOwner || Boolean(main))
  return (
    <div className="stack" style={{ gap: '0.4rem' }}>
      <SleeperTeamSelect
        id={id}
        value={value.sleeperUserId}
        memberId={memberId}
        onChange={(v) =>
          onChange({
            sleeperUserId: v,
            coOwner: Boolean(mainMemberOf(profiles, v, memberId ?? me?.id)),
          })
        }
      />
      {value.sleeperUserId && (
        <label className="checkbox-row small">
          <input
            type="checkbox"
            checked={coOwner}
            disabled={Boolean(main)}
            onChange={(e) => onChange({ ...value, coOwner: e.target.checked })}
          />
          <span>
            {main
              ? `Co-owner with ${main.display_name}: you share the team and pick your own parlay leg.`
              : 'I co-own this team (someone else is its main manager).'}
          </span>
        </label>
      )}
    </div>
  )
}

/**
 * The `co_owner` part of a profile update. Left out when it is false and the
 * database has no co_owner column yet (the co-owners migration not run), so
 * ordinary profile edits keep working either way.
 */
export function coOwnerPatch(
  profile: Profile | null | undefined,
  coOwner: boolean,
): Partial<Pick<Profile, 'co_owner'>> {
  return coOwner || profile?.co_owner !== undefined ? { co_owner: coOwner } : {}
}
