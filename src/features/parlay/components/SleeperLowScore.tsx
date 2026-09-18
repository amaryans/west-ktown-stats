import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, useLeague } from '../../../context/LeagueContext.tsx'
import { useParlay, type LowScoreResult } from '../ParlayContext.tsx'
import { weekLabel } from '../lib/week.ts'

export interface LowScoreState {
  loading: boolean
  result: LowScoreResult | null
  error: string | null
  linked: boolean
  sleeperError: string | null
}

/** Loads the lowest scorer for a fantasy week from Sleeper (when linked). */
export function useSleeperLowScore(fantasyWeek: number): LowScoreState {
  const { sleeper } = useLeague()
  const { sleeperLowestScorer } = useParlay()
  const [state, setState] = useState<{
    loading: boolean
    result: LowScoreResult | null
    error: string | null
  }>({
    loading: false,
    result: null,
    error: null,
  })
  useEffect(() => {
    if (!sleeper.data || !fantasyWeek || fantasyWeek < 1) {
      setState({ loading: false, result: null, error: null })
      return
    }
    let active = true
    setState({ loading: true, result: null, error: null })
    sleeperLowestScorer(fantasyWeek)
      .then((result) => {
        if (active) setState({ loading: false, result, error: null })
      })
      .catch((err: unknown) => {
        if (active) setState({ loading: false, result: null, error: errorMessage(err) })
      })
    return () => {
      active = false
    }
  }, [sleeper.data, fantasyWeek, sleeperLowestScorer])
  return { ...state, linked: Boolean(sleeper.data), sleeperError: sleeper.error }
}

export default function SleeperLowScore({
  low,
  fantasyWeek,
}: {
  low: LowScoreState
  fantasyWeek: number
}) {
  const { isCommissioner } = useLeague()
  if (!low.linked && !low.sleeperError) return null
  if (low.sleeperError)
    return (
      <div className="banner warn small">
        Couldn&apos;t reach Sleeper ({low.sleeperError}). Pick the loser by hand.
      </div>
    )
  if (low.loading)
    return <div className="muted small">Checking Sleeper for {weekLabel(fantasyWeek)} scores…</div>
  if (low.error) return <div className="banner warn small">Sleeper error: {low.error}</div>
  if (!low.result)
    return (
      <div className="muted small">
        Sleeper doesn&apos;t have final {weekLabel(fantasyWeek)} scores yet.
      </div>
    )
  return (
    <div className="banner success small">
      Sleeper: <strong>{low.result.displayName}</strong>
      {low.result.teamName ? ` (${low.result.teamName})` : ''} had the low score in{' '}
      {weekLabel(low.result.week)} with <strong>{low.result.points}</strong>.
      {!low.result.profile && (
        <>
          {' '}
          That Sleeper team isn&apos;t claimed by a member yet
          {isCommissioner ? (
            <>
              , <Link to="/settings/members">link it in Settings</Link>
            </>
          ) : (
            ' (ask the commissioner)'
          )}
          , so pick them below.
        </>
      )}
    </div>
  )
}
