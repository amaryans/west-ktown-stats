import { useState, type FormEvent } from 'react'
import SleeperTeamSelect from '../../components/SleeperTeamSelect.tsx'
import { useAuth } from '../../context/AuthContext.tsx'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'

export default function ProfileSettings() {
  const { user } = useAuth()
  const { me, sleeper, updateProfile } = useLeague()
  const [form, setForm] = useState({
    display_name: me?.display_name ?? '',
    team_name: me?.team_name ?? '',
    sleeper_user_id: me?.sleeper_user_id ?? null,
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
      })
      setMsg({ ok: true, text: 'Profile saved.' })
    } catch (err) {
      const text = errorMessage(err)
      setMsg({
        ok: false,
        text: text.includes('profiles_sleeper_user_idx')
          ? 'That Sleeper team is already claimed by another member.'
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
          <SleeperTeamSelect
            id="p-sleeper-team"
            value={form.sleeper_user_id}
            onChange={(v) => setForm((f) => ({ ...f, sleeper_user_id: v }))}
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
