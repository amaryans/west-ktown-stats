import { useMemo, useState } from 'react'
import Avatar from '../../../components/Avatar.tsx'
import type { ClinchStatus, ScheduledGame } from '../engine/index.ts'
import type { PredictionData, PredictionTeam } from '../loader.ts'
import {
  favouritePicks,
  gameKey,
  medianKey,
  picksProblem,
  statusLabel,
  whatIf,
  type Picks,
} from '../whatIf.ts'

/**
 * Pick winners for any remaining games (and median results) and see who
 * clinches or is knocked out, using the same exact check as the odds table.
 */
export default function WhatIf({
  data,
  highlightOwnerId,
}: {
  data: PredictionData
  highlightOwnerId?: string | null
}) {
  const weeks = data.remainingWeeks
  const [week, setWeek] = useState<number>(weeks[0] ?? 0)
  const [picks, setPicks] = useState<Picks>({})
  const teams = useMemo(() => new Map(data.teams.map((t) => [t.rosterId, t])), [data.teams])
  const problem = useMemo(() => picksProblem(data, picks), [data, picks])
  const rows = useMemo(() => (problem ? null : whatIf(data, picks)), [data, picks, problem])
  const picked = Object.keys(picks).length

  if (weeks.length === 0) return <p className="empty">No regular-season games left to pick.</p>

  const set = (key: string, value: number | boolean) =>
    setPicks((p) => {
      const next = { ...p }
      if (next[key] === value) delete next[key]
      else next[key] = value
      return next
    })
  const pickedIn = (w: number) =>
    Object.keys(picks).filter((k) => k.split(':')[1] === String(w)).length
  const games = data.schedule.filter((g) => g.week === week)
  const side = (g: ScheduledGame, id: number) => {
    const team = teams.get(id)
    if (!team) return null
    const median = picks[medianKey(week, id)]
    return (
      <div className="whatif__side">
        <button
          type="button"
          className={'whatif__pick' + (picks[gameKey(g)] === id ? ' is-picked' : '')}
          aria-pressed={picks[gameKey(g)] === id}
          onClick={() => set(gameKey(g), id)}
        >
          <Avatar src={team.avatarSrc} name={team.teamName} />
          <span className="team__name">{team.teamName}</span>
        </button>
        {data.medianGame && (
          <button
            type="button"
            className={
              'small whatif__median' +
              (median === true ? ' is-won' : median === false ? ' is-lost' : '')
            }
            title="Result against the league median: click to cycle beat / miss / not picked"
            aria-label={`${team.teamName} against the median: ${
              median === true ? 'beats' : median === false ? 'misses' : 'not picked'
            }`}
            onClick={() =>
              setPicks((p) => {
                const key = medianKey(week, id)
                const next = { ...p }
                if (next[key] === undefined) next[key] = true
                else if (next[key] === true) next[key] = false
                else delete next[key]
                return next
              })
            }
          >
            Med {median === true ? '✓' : median === false ? '✗' : '–'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="whatif">
      <div className="row between whatif__controls">
        <div className="whatif__weeks" role="group" aria-label="Week">
          {weeks.map((w) => (
            <button
              key={w}
              type="button"
              className={'small' + (w === week ? ' primary' : '')}
              aria-pressed={w === week}
              onClick={() => setWeek(w)}
            >
              Week {w}
              {pickedIn(w) > 0 ? ' •' : ''}
            </button>
          ))}
        </div>
        <div className="whatif__weeks">
          <button
            type="button"
            className="small"
            onClick={() => setPicks((p) => ({ ...p, ...favouritePicks(data, week) }))}
          >
            Pick favourites
          </button>
          <button
            type="button"
            className="small"
            disabled={picked === 0}
            onClick={() => setPicks({})}
          >
            Clear all
          </button>
        </div>
      </div>

      <ul className="whatif__games">
        {games.map((g) => (
          <li key={gameKey(g)} className="whatif__game">
            {side(g, g.home)}
            <span className="muted small">vs</span>
            {side(g, g.away)}
          </li>
        ))}
      </ul>

      {problem ? (
        <div className="banner warn">{problem}</div>
      ) : picked === 0 ? (
        <p className="muted small">Pick a winner by tapping a team. Tap again to clear it.</p>
      ) : (
        rows && (
          <div className="table-wrap">
            <table className="whatif__table" aria-label="What-if standings">
              <thead>
                <tr>
                  <th className="col-team">Team</th>
                  <th className="col-num">Record</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const team = teams.get(r.rosterId)
                  if (!team) return null
                  const isMe = Boolean(highlightOwnerId) && team.ownerId === highlightOwnerId
                  return (
                    <tr
                      key={r.rosterId}
                      className={[r.changed ? 'is-changed' : '', isMe ? 'is-me' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td className="col-team">
                        <TeamCell team={team} />
                      </td>
                      <td className="col-num">
                        {r.wins}-{r.losses}
                        {r.ties ? `-${r.ties}` : ''}
                      </td>
                      <td className="whatif__status">
                        {r.changed && (
                          <>
                            <Status status={r.before} />
                            <span className="muted"> → </span>
                          </>
                        )}
                        <Status status={r.after} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

function TeamCell({ team }: { team: PredictionTeam }) {
  return (
    <span className="team">
      <Avatar src={team.avatarSrc} name={team.teamName} />
      <span className="team__name">{team.teamName}</span>
    </span>
  )
}

function Status({ status }: { status: ClinchStatus }) {
  const label = statusLabel(status)
  if (label === 'Bye') return <span className="badge good">Bye ✓</span>
  if (label === 'Clinched') return <span className="badge good">Clinched</span>
  if (label === 'Out') return <span className="badge bad">Out</span>
  return <span className="muted small">Magic {status.magicNumber ?? '—'}</span>
}
