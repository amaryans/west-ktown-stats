import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AddMissingMembers from '../../../components/AddMissingMembers.tsx'
import { errorMessage, useLeague } from '../../../context/LeagueContext.tsx'
import type { Profile, Week } from '../../../lib/db.ts'
import { useParlay } from '../ParlayContext.tsx'
import { deriveParlayResult, formatMoney } from '../lib/odds.ts'
import { currentNflWeek, defaultLockAt, formatDateTime, isLocked, weekLabel } from '../lib/week.ts'
import { MemberSelect, ResultBadge } from '../components/Badges.tsx'
import LegTable from '../components/LegTable.tsx'
import ParlaySummary from '../components/ParlaySummary.tsx'
import SleeperLowScore, { useSleeperLowScore } from '../components/SleeperLowScore.tsx'

export default function ThisWeek() {
  const { settings, profiles, me, isCommissioner, sleeper } = useLeague()
  const { weeks, legsForWeek, findWeek, createWeek, updateWeek } = useParlay()
  const { nameOf } = useLeague()
  const season = settings?.season ?? new Date().getFullYear()
  const seasonStart = settings?.season_start ?? null
  // Sleeper knows the real NFL week; the date-based calculation is the fallback.
  const nflWeek = sleeper.data?.currentWeek ?? currentNflWeek(seasonStart)
  const week = findWeek(season, nflWeek)
  const low = useSleeperLowScore(nflWeek - 1)

  const [loserId, setLoserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Pre-select the Sleeper loser once it loads.
  useEffect(() => {
    if (low.result?.profile && !loserId) setLoserId(low.result.profile.id)
  }, [low.result, loserId])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const fromSleeper = low.result?.profile && low.result.profile.id === loserId
      await createWeek({
        season,
        week: nflWeek,
        loser_id: loserId,
        low_score: fromSleeper ? (low.result?.points ?? null) : null,
        stake: settings?.default_stake ?? 5,
        lock_at: seasonStart ? defaultLockAt(seasonStart, nflWeek).toISOString() : null,
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const recent = weeks.filter((w) => w.parlay_result !== 'pending').slice(0, 5)

  if (!week) {
    return (
      <div className="stack">
        <AddMissingMembers compact />
        <div className="card">
          <div className="card-header">
            <h2>
              {weekLabel(nflWeek)} · {season}
            </h2>
          </div>
          <p>
            No parlay set up for this week yet. Whoever had the lowest score in{' '}
            {nflWeek > 1 ? weekLabel(nflWeek - 1) : 'the last matchup'} places it.
          </p>
          <SleeperLowScore low={low} fantasyWeek={nflWeek - 1} />
          <div className="form-grid mt">
            <div className="field">
              <label htmlFor="f-placing">Placing the parlay (lowest fantasy score)</label>
              <MemberSelect
                id="f-placing"
                value={loserId}
                onChange={setLoserId}
                profiles={profiles}
                placeholder="Decide later"
              />
            </div>
          </div>
          {error && <div className="error small mt">{error}</div>}
          <div className="row mt">
            <button
              type="button"
              className="primary"
              onClick={() => void create()}
              disabled={busy || low.loading}
            >
              {low.loading ? 'Checking Sleeper…' : `Start ${weekLabel(nflWeek)}`}
            </button>
            <Link to="/parlay/weeks" className="muted small">
              Or look at a different week
            </Link>
          </div>
        </div>
        <RecentResults recent={recent} />
      </div>
    )
  }

  const legs = legsForWeek(week.id)
  const eligible = profiles.filter((p) => settings?.loser_adds_leg || p.id !== week.loser_id)
  const missing = eligible.filter((p) => !legs.some((l) => l.user_id === p.id))
  const derived = deriveParlayResult(legs)
  const locked = isLocked(week)
  const iAmLoser = week.loser_id === me?.id
  const myLeg = legs.find((l) => l.user_id === me?.id)
  const iPick = settings?.loser_adds_leg || !iAmLoser
  const sleeperMismatch =
    low.result?.profile && week.loser_id && low.result.profile.id !== week.loser_id

  return (
    <div className="stack">
      <AddMissingMembers compact />
      <div className="card">
        <div className="card-header">
          <h2>
            {weekLabel(week.week)} · {season}
          </h2>
          <div className="row">
            {locked ? (
              <span className="badge locked">Locked</span>
            ) : week.lock_at ? (
              <span className="muted small">Locks {formatDateTime(week.lock_at)}</span>
            ) : null}
            <ResultBadge result={week.parlay_result !== 'pending' ? week.parlay_result : derived} />
            <Link className="btn small" to={`/parlay/weeks/${week.season}/${week.week}`}>
              Manage week
            </Link>
          </div>
        </div>

        {week.loser_id ? (
          <div className="loser-callout">
            <div>
              <div className="muted small">
                Placing the parlay{week.low_score ? ` · scored ${week.low_score}` : ''}
              </div>
              <div className="big">
                {nameOf(week.loser_id)}
                {iAmLoser ? " (that's you)" : ''}
              </div>
            </div>
          </div>
        ) : (
          <div className="banner warn">
            Nobody has been tagged as the loser yet.
            {low.result?.profile ? (
              <>
                {' '}
                Sleeper says <strong>{low.result.profile.display_name}</strong> scored{' '}
                {low.result.points} in {weekLabel(low.result.week)}.{' '}
                <button
                  type="button"
                  className="small primary"
                  onClick={() => {
                    const r = low.result
                    if (r?.profile)
                      void updateWeek(week.id, { loser_id: r.profile.id, low_score: r.points })
                  }}
                >
                  Tag {low.result.profile.display_name}
                </button>
              </>
            ) : (
              <LoserPicker week={week} profiles={profiles} updateWeek={updateWeek} />
            )}
          </div>
        )}
        {sleeperMismatch && isCommissioner && low.result?.profile && (
          <div className="banner warn mt">
            Sleeper says <strong>{low.result.profile.display_name}</strong> had the low score (
            {low.result.points}), not {nameOf(week.loser_id)}.{' '}
            <button
              type="button"
              className="small"
              onClick={() => {
                const r = low.result
                if (r?.profile)
                  void updateWeek(week.id, { loser_id: r.profile.id, low_score: r.points })
              }}
            >
              Switch
            </button>
          </div>
        )}
        {sleeper.error && (
          <div className="banner warn mt small">
            Couldn&apos;t reach Sleeper ({sleeper.error}). Tag the loser by hand this week.
          </div>
        )}

        <div className="mt">
          <ParlaySummary legs={legs} stake={week.stake} expectedLegs={eligible.length} />
        </div>

        {iPick && !myLeg && (
          <div className="banner mt">
            You haven&apos;t added your leg yet. Use <strong>Add my leg</strong> below or grab a
            line from the{' '}
            <Link to={`/parlay/board?season=${week.season}&week=${week.week}`}>odds board</Link>.
          </div>
        )}
        {missing.length > 0 && (
          <p className="muted small mt">
            Still waiting on: {missing.map((p) => p.display_name).join(', ')}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Legs</h2>
        <LegTable week={week} />
      </div>

      <RecentResults recent={recent} />
    </div>
  )
}

function LoserPicker({
  week,
  profiles,
  updateWeek,
}: {
  week: Week
  profiles: Profile[]
  updateWeek: (id: string, fields: Partial<Week>) => Promise<void>
}) {
  const [val, setVal] = useState<string | null>(null)
  return (
    <span className="row" style={{ display: 'inline-flex', marginLeft: '.5rem' }}>
      <MemberSelect value={val} onChange={setVal} profiles={profiles} />
      <button
        type="button"
        className="small primary"
        disabled={!val}
        onClick={() => void updateWeek(week.id, { loser_id: val })}
      >
        Set
      </button>
    </span>
  )
}

export function RecentResults({ recent }: { recent: Week[] }) {
  const { nameOf } = useLeague()
  const { legsForWeek } = useParlay()
  if (!recent.length) return null
  return (
    <div className="card">
      <div className="card-header">
        <h2>Recent parlays</h2>
        <Link to="/parlay/stats" className="small">
          All stats
        </Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Placed by</th>
              <th className="num">Legs</th>
              <th className="num">Stake</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((w) => (
              <tr key={w.id}>
                <td>
                  <Link to={`/parlay/weeks/${w.season}/${w.week}`}>{weekLabel(w.week)}</Link>
                </td>
                <td>{w.loser_id ? nameOf(w.loser_id) : '—'}</td>
                <td className="num">{legsForWeek(w.id).length}</td>
                <td className="num">{formatMoney(w.stake)}</td>
                <td>
                  <ResultBadge result={w.parlay_result} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
