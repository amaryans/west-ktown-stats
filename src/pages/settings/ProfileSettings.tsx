import { useState, type FormEvent } from 'react'
import { mainMemberOf } from '../../components/SleeperTeamSelect.tsx'
import TeamClaimFields, { coOwnerPatch } from '../../components/TeamClaimFields.tsx'
import { useAuth } from '../../context/AuthContext.tsx'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'

export default function ProfileSettings() {
  const { user } = useAuth()
  const { me, sleeper, profiles, updateProfile } = useLeague()
  const [form, setForm] = useState({
    display_name: me?.display_name ?? '',
    team_name: me?.team_name ?? '',
    sleeper_user_id: me?.sleeper_user_id ?? null,
    co_owner: me?.co_owner ?? false,
  })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await updateProfile({
        display_name: form.display_name.trim(),
        team_name: form.team_name.trim() || null,
        sleeper_user_id: form.sleeper_user_id || null,
        // Joining a team that already has a main member always makes you a co-owner.
        ...coOwnerPatch(
          me,
          Boolean(form.sleeper_user_id) &&
            (form.co_owner || Boolean(mainMemberOf(profiles, form.sleeper_user_id, me?.id))),
        ),
      })
      setMsg({ ok: true, text: 'Profile saved.' })
    } catch (err) {
      const text = errorMessage(err)
      setMsg({
        ok: false,
        text: text.includes('profiles_sleeper_user_idx')
          ? 'That Sleeper team already has a main member. Join it as a co-owner instead.'
          : text,
      })
    } finally {
      setBusy(false)
    }
  }

  if (!me) return null
  const claimedTeam = sleeper.data?.teams.find((t) => t.userId === form.sleeper_user_id)

  return (
    <form className="card stack" onSubmit={(e) => void save(e)}>
      <h2>
        Your profile{' '}
        {me.is_commissioner && (
          <span className="badge gold" style={{ marginLeft: '0.4rem' }}>
            commissioner
          </span>
        )}
      </h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="p-display-name">Display name</label>
          <input
            id="p-display-name"
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="p-team-name">Fantasy team name</label>
          <input
            id="p-team-name"
            value={form.team_name}
            onChange={(e) => setForm((f) => ({ ...f, team_name: e.target.value }))}
            placeholder={claimedTeam?.teamName ?? ''}
          />
        </div>
        <div className="field">
          <label htmlFor="p-email">Email</label>
          <input id="p-email" value={user?.email ?? ''} disabled />
        </div>
        <div className="field">
          <label htmlFor="p-sleeper-team">Your Sleeper team</label>
          <TeamClaimFields
            id="p-sleeper-team"
            value={{ sleeperUserId: form.sleeper_user_id, coOwner: form.co_owner }}
            onChange={(v) =>
              setForm((f) => ({ ...f, sleeper_user_id: v.sleeperUserId, co_owner: v.coOwner }))
            }
          />
          <span className="help">
            Claiming your team links you to your roster: the Team tab, highlighted standings rows,
            and the loser-parlay auto-fill all use it.
          </span>
        </div>
      </div>
      {msg && <div className={msg.ok ? 'success small' : 'error small'}>{msg.text}</div>}
      <div className="row end">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}
