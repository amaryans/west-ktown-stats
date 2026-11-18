import { useEffect, useState } from 'react'
import Avatar from '../../../components/Avatar.tsx'
import {
  byeCount,
  clinchScenarios,
  scenarioChances,
  type ScenarioGoal,
  type TeamScenarios,
  type WeekResult,
} from '../engine/index.ts'
import { fmtPct } from '../format.ts'
import type { PredictionData, PredictionTeam } from '../loader.ts'

const CHANCE_RUNS = 5000
const CHANCE_SEED = 0x43_4c_4e // "CLN"

const GOAL_TITLES: Record<ScenarioGoal, string> = {
  bye: 'Can clinch a first-round bye',
  playoffs: 'Can clinch a playoff spot',
  eliminated: 'Can be eliminated',
}

interface Entry extends TeamScenarios {
  chance: number
}

/**
 * What each team needs this week to clinch a bye or a playoff spot, or what
 * would knock it out. Worked out exactly from every combination of the
 * week's results (a second or so with the median game), so it runs after
 * the page has drawn.
 */
export default function ClinchScenarios({
  data,
  week,
  highlightOwnerId,
}: {
  data: PredictionData
  week: number
  highlightOwnerId?: string | null
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEntries(null)
    setError(null)
    const timer = setTimeout(() => {
      try {
        const spots = Math.min(data.playoffTeams, data.teams.length)
        const found = clinchScenarios({
          teams: data.teams.map((t) => ({
            rosterId: t.rosterId,
            wins: t.record.wins,
            losses: t.record.losses,
            ties: t.record.ties,
            pointsFor: t.pointsFor,
          })),
          schedule: data.schedule,
          weeks: data.remainingWeeks,
          medianGame: data.medianGame,
          spots,
          byes: byeCount(spots),
          week,
        })
        const chances = scenarioChances(found, {
          week,
          rosterIds: data.teams.map((t) => t.rosterId),
          schedule: data.schedule,
          medianGame: data.medianGame,
          forecasts: data.forecasts,
          runs: CHANCE_RUNS,
          seed: CHANCE_SEED,
        })
        setEntries(found.map((e, i) => ({ ...e, chance: chances[i] ?? 0 })))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [data, week])

  if (error) return <p className="empty">Could not work out scenarios: {error}</p>
  if (!entries) return <p className="muted small">Working out scenarios…</p>
  if (entries.length === 0) {
    return <p className="empty">No team can clinch or be eliminated in week {week}.</p>
  }

  const teams = new Map(data.teams.map((t) => [t.rosterId, t]))
  const goals: ScenarioGoal[] = ['bye', 'playoffs', 'eliminated']
  return (
    <div className="scenarios">
      {goals.map((goal) => {
        const rows = entries.filter((e) => e.goal === goal).sort((a, b) => b.chance - a.chance)
        if (rows.length === 0) return null
        return (
          <section key={goal}>
            <h3 className="scenarios__title">{GOAL_TITLES[goal]}</h3>
            <ul className="scenarios__list">
              {rows.map((e) => {
                const team = teams.get(e.rosterId)
                if (!team) return null
                const isMe = Boolean(highlightOwnerId) && team.ownerId === highlightOwnerId
                return (
                  <li key={e.rosterId} className={'scenario' + (isMe ? ' is-me' : '')}>
                    <div className="scenario__team">
                      <Avatar src={team.avatarSrc} name={team.teamName} />
                      <div className="scenario__names">
                        <div className="team__name">{team.teamName}</div>
                        <div className="team__owner">{team.ownerName}</div>
                      </div>
                      <span
                        className={'badge ' + (goal === 'eliminated' ? 'bad' : 'good')}
                        title="Chance one of these happens this week, from the projections"
                      >
                        {e.complete ? '' : '≥'}
                        {fmtPct(e.chance)}
                      </span>
                    </div>
                    <ul className="scenario__options">
                      {e.scenarios.map((s, i) => (
                        <li key={i}>
                          {i > 0 && <span className="muted small">or </span>}
                          {describe(s, e.rosterId, goal, teams).map((phrase, j) => (
                            <span key={j}>
                              {j > 0 && <span className="muted"> + </span>}
                              {phrase}
                            </span>
                          ))}
                        </li>
                      ))}
                      {!e.complete && (
                        <li className="muted small">or another, longer combination</li>
                      )}
                    </ul>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/**
 * One phrase per team involved, the team itself first: "Beat Team B and the
 * median", "Team C loses to Team D and misses the median".
 */
function describe(
  results: readonly WeekResult[],
  rosterId: number,
  goal: ScenarioGoal,
  teams: Map<number, PredictionTeam>,
): string[] {
  const name = (id: number) => teams.get(id)?.teamName ?? `Team ${id}`
  const groups = new Map<number, { game?: WeekResult; median?: WeekResult }>()
  for (const r of results) {
    const subject =
      r.kind === 'median'
        ? r.rosterId
        : r.winner === rosterId || r.loser === rosterId
          ? rosterId
          : goal === 'eliminated'
            ? r.winner
            : r.loser
    const g = groups.get(subject) ?? {}
    if (r.kind === 'median') g.median = r
    else g.game = r
    groups.set(subject, g)
  }
  const order = [...groups.keys()].sort((a, b) => Number(b === rosterId) - Number(a === rosterId))
  return order.map((id) => {
    const { game, median } = groups.get(id) ?? {}
    const self = id === rosterId
    const parts: string[] = []
    if (game?.kind === 'game') {
      const won = game.winner === id
      const opp = name(won ? game.loser : game.winner)
      parts.push(
        self ? (won ? `Beat ${opp}` : `Lose to ${opp}`) : won ? `beats ${opp}` : `loses to ${opp}`,
      )
    }
    if (median?.kind === 'median') {
      const won = median.won
      if (game) parts.push(won ? 'the median' : self ? 'miss the median' : 'misses the median')
      else
        parts.push(
          self
            ? won
              ? 'Beat the median'
              : 'Miss the median'
            : won
              ? 'beats the median'
              : 'misses the median',
        )
    }
    const text = parts.join(' and ')
    return self ? text : `${name(id)} ${text}`
  })
}
