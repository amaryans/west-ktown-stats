import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.tsx'
import { errorMessage } from '../../context/LeagueContext.tsx'
import { loadSleeperLeague, teamLabel, type SleeperTeam } from '../../lib/sleeper/league.ts'
import { supabase } from '../../lib/supabase.ts'
import { useLeagueInfo } from './useLeagueInfo.ts'

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const info = useLeagueInfo()
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    teamName: '',
    inviteCode: '',
    sleeperUserId: '',
  })
  const [teams, setTeams] = useState<SleeperTeam[]>([])
  const [claimed, setClaimed] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  // If the league is linked to Sleeper, offer its teams so the new member
  // can claim theirs (and we can prefill their names).
  useEffect(() => {
    if (!info.sleeper_league_id) return
    let active = true
    loadSleeperLeague(info.sleeper_league_id)
      .then((league) => {
        if (active) setTeams(league.teams)
      })
      .catch(() => {})
    supabase.rpc('claimed_sleeper_users').then(({ data }) => {
      if (active && Array.isArray(data)) setClaimed(new Set(data as string[]))
    })
    return () => {
      active = false
    }
  }, [info.sleeper_league_id])

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  function chooseTeam(e: ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    const t = teams.find((x) => x.userId === id)
    setForm((f) => ({
      ...f,
      sleeperUserId: id,
      displayName: f.displayName || t?.displayName || '',
      teamName: f.teamName || t?.teamName || '',
    }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { needsConfirmation } = await signUp({
        email: form.email.trim(),
        password: form.password,
        displayName: form.displayName.trim(),
        teamName: form.teamName.trim(),
        inviteCode: form.inviteCode.trim(),
        sleeperUserId: form.sleeperUserId || null,
      })
      if (needsConfirmation) setDone(true)
      else navigate('/')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="auth-shell">
        <div className="card auth-card">
          <h1>Check your email</h1>
          <p>
            We sent a confirmation link to <strong>{form.email}</strong>. Click it, then{' '}
            <Link to="/login">sign in</Link>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <form className="card auth-card stack" onSubmit={(e) => void submit(e)}>
        <div>
          <h1>Join {info.league_name}</h1>
          <p className="muted">You need the league invite code from the commissioner.</p>
        </div>
        <div className="field">
          <label htmlFor="f-invite-code">Invite code</label>
          <input
            id="f-invite-code"
            value={form.inviteCode}
            onChange={set('inviteCode')}
            required
            autoCapitalize="off"
          />
        </div>
        {teams.length > 0 && (
          <div className="field">
            <label htmlFor="f-sleeper-team">Claim your Sleeper team</label>
            <select id="f-sleeper-team" value={form.sleeperUserId} onChange={chooseTeam}>
              <option value="">Pick your team</option>
              {teams
                .filter((t) => t.userId)
                .map((t) => (
                  <option
                    key={t.userId}
                    value={t.userId ?? ''}
                    disabled={claimed.has(t.userId ?? '')}
                  >
                    {teamLabel(t)}
                    {claimed.has(t.userId ?? '') ? ' (already claimed)' : ''}
                  </option>
                ))}
            </select>
            <span className="help">Links your account to your roster for the Team tab.</span>
          </div>
        )}
        <div className="field">
          <label htmlFor="f-display-name">Your name (shown to the league)</label>
          <input
            id="f-display-name"
            value={form.displayName}
            onChange={set('displayName')}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="f-team-name">Fantasy team name (optional)</label>
          <input id="f-team-name" value={form.teamName} onChange={set('teamName')} />
        </div>
        <div className="field">
          <label htmlFor="f-email">Email</label>
          <input
            id="f-email"
            type="email"
            value={form.email}
            onChange={set('email')}
            autoComplete="email"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="f-password">Password</label>
          <input
            id="f-password"
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        {error && <div className="error small">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <p className="small muted center">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
