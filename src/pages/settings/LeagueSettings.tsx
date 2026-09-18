import { useState, type ChangeEvent, type FormEvent } from 'react'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'

export default function LeagueSettingsForm() {
  const { settings, profiles, sleeper, isCommissioner, updateSettings } = useLeague()
  const [league, setLeague] = useState({
    league_name: settings?.league_name ?? '',
    invite_code: settings?.invite_code ?? '',
    season: settings?.season ?? new Date().getFullYear(),
    season_start: settings?.season_start ?? '',
    sleeper_league_id: settings?.sleeper_league_id ?? '',
    default_stake: String(settings?.default_stake ?? 5),
    loser_adds_leg: settings?.loser_adds_leg ?? true,
  })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof league) => (e: ChangeEvent<HTMLInputElement>) =>
    setLeague((f) => ({
      ...f,
      [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }))

  const commissioners = profiles.filter((p) => p.is_commissioner).map((p) => p.display_name)
  const sleeperStatus = !league.sleeper_league_id.trim()
    ? null
    : sleeper.loading
      ? 'Connecting to Sleeper…'
      : sleeper.error
        ? `Could not load that league: ${sleeper.error}`
        : sleeper.data
          ? `Connected: ${sleeper.data.name} (${sleeper.data.teams.length} teams, ${sleeper.data.season}, ${sleeper.data.status.replace('_', ' ')})`
          : 'Save to connect.'

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await updateSettings({
        league_name: league.league_name.trim(),
        invite_code: league.invite_code.trim(),
        season: Number(league.season),
        season_start: league.season_start,
        sleeper_league_id: league.sleeper_league_id.trim() || null,
        default_stake: Number(league.default_stake) || 0,
        loser_adds_leg: Boolean(league.loser_adds_leg),
      })
      setMsg({ ok: true, text: 'League settings saved.' })
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  if (!settings) return null

  if (!isCommissioner) {
    return (
      <div className="card">
        <h2>League</h2>
        <div className="stat-tiles">
          <div className="tile">
            <div className="label">League</div>
            <div className="value text">{settings.league_name}</div>
          </div>
          <div className="tile">
            <div className="label">Season</div>
            <div className="value">{settings.season}</div>
          </div>
          <div className="tile">
            <div className="label">Sleeper</div>
            <div className="value text">{sleeper.data ? sleeper.data.name : 'Not linked'}</div>
          </div>
        </div>
        <p className="muted small mt">
          Commissioner{commissioners.length === 1 ? '' : 's'}: {commissioners.join(', ') || 'none'}.
          Only they can change league settings, link members to Sleeper teams, define stats and
          publish the draft order.
        </p>
      </div>
    )
  }

  return (
    <form className="card stack" onSubmit={(e) => void save(e)}>
      <h2>
        League settings <span className="muted small">(commissioner)</span>
      </h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="l-name">League name</label>
          <input id="l-name" value={league.league_name} onChange={set('league_name')} required />
        </div>
        <div className="field">
          <label htmlFor="l-invite">Invite code (needed to sign up)</label>
          <input id="l-invite" value={league.invite_code} onChange={set('invite_code')} required />
        </div>
        <div className="field">
          <label htmlFor="l-season">Current season</label>
          <input
            id="l-season"
            type="number"
            value={league.season}
            onChange={set('season')}
            required
          />
          <span className="help">
            The draft order and keeper list are published against this year.
          </span>
        </div>
        <div className="field">
          <label htmlFor="l-start">Week 1 Thursday (season start)</label>
          <input
            id="l-start"
            type="date"
            value={league.season_start}
            onChange={set('season_start')}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="l-stake">Parlay default stake ($)</label>
          <input
            id="l-stake"
            type="number"
            step="0.01"
            min="0"
            value={league.default_stake}
            onChange={set('default_stake')}
          />
          <span className="help">Whoever places the parlay can change it for their week.</span>
        </div>
        <div className="field checkbox-row" style={{ alignSelf: 'end' }}>
          <input
            id="l-loser-leg"
            type="checkbox"
            checked={league.loser_adds_leg}
            onChange={set('loser_adds_leg')}
          />
          <label htmlFor="l-loser-leg">The parlay placer also picks a leg</label>
        </div>
        <div className="field wide">
          <label htmlFor="l-sleeper">Sleeper league ID</label>
          <input
            id="l-sleeper"
            value={league.sleeper_league_id}
            onChange={set('sleeper_league_id')}
            placeholder="e.g. 1124849636478976000"
            inputMode="numeric"
          />
          <span className="help">
            The long number in your Sleeper league URL (sleeper.com/leagues/<strong>ID</strong>/…).
            Any season&apos;s ID works — earlier seasons are found automatically. This powers
            standings, team pages, the lottery import and keepers.
            {sleeperStatus && (
              <>
                <br />
                {sleeperStatus}
              </>
            )}
          </span>
        </div>
      </div>
      {msg && <div className={msg.ok ? 'success small' : 'error small'}>{msg.text}</div>}
      <div className="row end">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save league settings'}
        </button>
      </div>
    </form>
  )
}
