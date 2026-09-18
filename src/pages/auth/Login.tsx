import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.tsx'
import { errorMessage } from '../../context/LeagueContext.tsx'
import { useLeagueInfo } from './useLeagueInfo.ts'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const { league_name: leagueName } = useLeagueInfo()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      navigate('/')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="card auth-card stack" onSubmit={(e) => void submit(e)}>
        <div>
          <h1>{leagueName}</h1>
          <p className="muted">Standings, draft lottery, keepers and stats. Sign in to continue.</p>
        </div>
        <div className="field">
          <label htmlFor="f-email">Email</label>
          <input
            id="f-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="f-password">Password</label>
          <input
            id="f-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <div className="error small">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="small muted center">
          New to the league? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </div>
  )
}
