import Avatar from '../../../components/Avatar.tsx'
import { forecastKey, winProbability } from '../engine/index.ts'
import { fmt1, fmtPct, pctFill } from '../format.ts'
import type { PredictionData, PredictionTeam } from '../loader.ts'

/** The next unplayed week's games with projected scores and win probabilities. */
export default function WeekMatchups({
  data,
  week,
  highlightOwnerId,
}: {
  data: PredictionData
  week: number
  highlightOwnerId?: string | null
}) {
  const teams = new Map(data.teams.map((t) => [t.rosterId, t]))
  const games = data.schedule.filter((g) => g.week === week)
  if (games.length === 0) return <p className="empty">No games scheduled for week {week}.</p>
  return (
    <ul className="matchups">
      {games.map((g) => {
        const home = teams.get(g.home)
        const away = teams.get(g.away)
        const fh = data.forecasts[forecastKey(g.home, week)]
        const fa = data.forecasts[forecastKey(g.away, week)]
        if (!home || !away || !fh || !fa) return null
        const p = winProbability(fh, fa)
        return (
          <li key={`${g.home}-${g.away}`} className="matchup">
            <Side
              team={home}
              mean={fh.mean}
              p={p}
              me={highlightOwnerId}
              byes={fh.lineup.byes.length}
            />
            <span className="matchup__vs muted small">vs</span>
            <Side
              team={away}
              mean={fa.mean}
              p={1 - p}
              me={highlightOwnerId}
              byes={fa.lineup.byes.length}
              right
            />
          </li>
        )
      })}
    </ul>
  )
}

function Side({
  team,
  mean,
  p,
  me,
  byes,
  right = false,
}: {
  team: PredictionTeam
  mean: number
  p: number
  me?: string | null
  byes: number
  right?: boolean
}) {
  const isMe = Boolean(me) && team.ownerId === me
  return (
    <div
      className={['matchup__side', right ? 'matchup__side--right' : '', isMe ? 'is-me' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <Avatar src={team.avatarSrc} name={team.teamName} />
      <div className="matchup__names">
        <div className="team__name">{team.teamName}</div>
        <div className="team__owner">
          proj. {fmt1(mean)}
          {byes > 0 ? ` · ${byes} on bye` : ''}
        </div>
      </div>
      <div
        className={'matchup__odds' + (p >= 0.5 ? ' is-favourite' : '')}
        style={{ background: pctFill(p) }}
      >
        {fmtPct(p)}
      </div>
    </div>
  )
}
