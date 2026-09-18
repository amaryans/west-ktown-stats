import { useState } from 'react'
import {
  getLeagueBundle,
  getUserByName,
  getUserLeagues,
  SleeperApiError,
} from '../../data/sleeper/client.ts'
import { mapSleeperLeague } from '../../data/sleeper/mapping.ts'
import { isPreseason } from '../../data/ordering.ts'
import type { League } from '../../data/types.ts'
import type { SleeperLeague } from '../../../../lib/sleeper/types.ts'
import Button from '../common/Button.tsx'
import ErrorBanner from '../common/ErrorBanner.tsx'

interface SleeperImportFormProps {
  onImported: (league: League) => void
  /** The league linked in Settings, prefilled so one click imports it. */
  defaultLeagueId?: string | null
}

type Mode = 'leagueId' | 'username'

export default function SleeperImportForm({
  onImported,
  defaultLeagueId = null,
}: SleeperImportFormProps) {
  const [mode, setMode] = useState<Mode>('leagueId')
  const [leagueId, setLeagueId] = useState(defaultLeagueId ?? '')
  const [username, setUsername] = useState('')
  const [season, setSeason] = useState(String(new Date().getFullYear()))
  const [userLeagues, setUserLeagues] = useState<SleeperLeague[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preseasonLeague, setPreseasonLeague] = useState<League | null>(null)

  async function importLeague(id: string) {
    setIsLoading(true)
    setError(null)
    setPreseasonLeague(null)
    try {
      const league = mapSleeperLeague(await getLeagueBundle(id))
      if (isPreseason(league.teams)) {
        // A fresh season's league has no results to weight the lottery with.
        setPreseasonLeague(league)
        return
      }
      onImported(league)
    } catch (cause) {
      setError(cause instanceof SleeperApiError ? cause.message : 'Something went wrong importing')
    } finally {
      setIsLoading(false)
    }
  }

  async function findUserLeagues() {
    setIsLoading(true)
    setError(null)
    setUserLeagues(null)
    try {
      const user = await getUserByName(username)
      const leagues = await getUserLeagues(user.user_id, season)
      if (leagues.length === 0) {
        setError(`No ${season} leagues found for ${username}`)
        return
      }
      setUserLeagues(leagues)
    } catch (cause) {
      setError(cause instanceof SleeperApiError ? cause.message : 'Something went wrong searching')
    } finally {
      setIsLoading(false)
    }
  }

  const inputClasses =
    'w-full rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-white placeholder-white/40 focus:border-white/60 focus:outline-none'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 text-sm">
        <Button
          variant={mode === 'leagueId' ? 'secondary' : 'ghost'}
          onClick={() => setMode('leagueId')}
        >
          By league ID
        </Button>
        <Button
          variant={mode === 'username' ? 'secondary' : 'ghost'}
          onClick={() => setMode('username')}
        >
          By username
        </Button>
      </div>

      {mode === 'leagueId' ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void importLeague(leagueId)
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-white/80">
            Sleeper league ID
            <input
              className={inputClasses}
              value={leagueId}
              onChange={(event) => setLeagueId(event.target.value)}
              placeholder="e.g. 1120170487285882880"
              inputMode="numeric"
            />
          </label>
          <Button type="submit" disabled={isLoading || leagueId.trim().length === 0}>
            {isLoading ? 'Importing…' : 'Import league'}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void findUserLeagues()
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-white/80">
            Sleeper username
            <input
              className={inputClasses}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="your username"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-white/80">
            Season
            <input
              className={inputClasses}
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              inputMode="numeric"
              maxLength={4}
            />
          </label>
          <Button type="submit" disabled={isLoading || username.trim().length === 0}>
            {isLoading ? 'Searching…' : 'Find my leagues'}
          </Button>
        </form>
      )}

      {userLeagues && (
        <ul className="flex flex-col gap-2">
          {userLeagues.map((league) => (
            <li key={league.league_id}>
              <button
                type="button"
                className="w-full cursor-pointer rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-left hover:bg-white/15"
                onClick={() => void importLeague(league.league_id)}
              >
                <span className="font-semibold">{league.name}</span>
                <span className="ml-2 text-sm text-white/60">
                  {league.total_rosters} teams · {league.season}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {preseasonLeague && (
        <div className="flex flex-col gap-2 rounded-lg border border-gold/60 bg-gold/10 px-4 py-3 text-sm">
          <p>
            This league has no results yet — a lottery needs last season&apos;s standings. Sleeper
            creates a new league ID each season.
          </p>
          {preseasonLeague.previousLeagueId ? (
            <Button
              variant="secondary"
              onClick={() => void importLeague(preseasonLeague.previousLeagueId as string)}
            >
              Use last season&apos;s league instead
            </Button>
          ) : (
            <p className="text-white/60">No previous season found for this league.</p>
          )}
        </div>
      )}

      <ErrorBanner message={error} />
    </div>
  )
}
