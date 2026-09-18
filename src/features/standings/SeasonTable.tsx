import { useState } from 'react'
import Avatar from '../../components/Avatar.tsx'
import { sleeperAvatarUrl } from '../../lib/sleeper/client.ts'
import type { SeasonStandings } from './history.ts'
import { formatRecord, rank, type SeasonTeam } from './standings.ts'

export function fmtPts(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function teamAvatarSrc(team: Pick<SeasonTeam, 'avatar' | 'teamAvatarUrl'>): string | null {
  return team.teamAvatarUrl || (team.avatar ? sleeperAvatarUrl(team.avatar) : null)
}

export function StandingsTable({
  season,
  medianOn,
  highlightOwnerId,
}: {
  season: SeasonStandings
  medianOn: boolean
  highlightOwnerId?: string | null
}) {
  const ranked = rank(season.teams, medianOn ? 'combined' : 'h2h')
  return (
    <div className="table-wrap">
      <table className={'standings' + (medianOn ? ' standings--median' : '')}>
        <thead>
          <tr>
            <th className="col-rank" scope="col">
              #
            </th>
            <th className="col-team" scope="col">
              Team
            </th>
            <th className="col-num" scope="col">
              Record
            </th>
            {medianOn && (
              <th className="col-num" scope="col">
                vs Median
              </th>
            )}
            {medianOn && (
              <th className="col-num col-strong" scope="col">
                Overall
              </th>
            )}
            <th className="col-num" scope="col">
              PF
            </th>
            <th className="col-num" scope="col">
              PA
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((t) => {
            const isChamp = season.champion != null && t.rosterId === season.champion
            const isMe = Boolean(highlightOwnerId) && t.ownerId === highlightOwnerId
            const cls = [isChamp ? 'is-champion' : '', isMe ? 'is-me' : '']
              .filter(Boolean)
              .join(' ')
            return (
              <tr key={t.rosterId} className={cls || undefined}>
                <td className="col-rank" data-label="Rank">
                  {t.rank}
                </td>
                <td className="col-team">
                  <div className="team">
                    <Avatar src={teamAvatarSrc(t)} name={t.teamName} />
                    <div className="team__names">
                      <div className="team__name">
                        {t.teamName}
                        {isChamp && (
                          <span className="trophy" title="League champion">
                            🏆
                          </span>
                        )}
                      </div>
                      <div className="team__owner">{t.ownerName}</div>
                    </div>
                  </div>
                </td>
                <td className="col-num" data-label="Record">
                  {formatRecord(t.h2h)}
                </td>
                {medianOn && (
                  <td className="col-num" data-label="vs Median">
                    {formatRecord(t.median)}
                  </td>
                )}
                {medianOn && (
                  <td className="col-num col-strong" data-label="Overall">
                    {formatRecord(t.combined)}
                  </td>
                )}
                <td className="col-num" data-label="PF">
                  {fmtPts(t.pointsFor)}
                </td>
                <td className="col-num" data-label="PA">
                  {fmtPts(t.pointsAgainst)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function SeasonSection({
  season,
  highlightOwnerId,
}: {
  season: SeasonStandings
  highlightOwnerId?: string | null
}) {
  const [medianOn, setMedianOn] = useState(season.medianEnabled)
  const played = season.weeksPlayed.length
  const subtitleParts: string[] = []
  if (played === 0) subtitleParts.push('No games played yet')
  else subtitleParts.push(`Regular season · ${played} week${played === 1 ? '' : 's'}`)
  if (season.status === 'in_season') subtitleParts.push('In progress')
  subtitleParts.push(
    season.medianEnabled ? 'League median was on in Sleeper' : 'League median was off in Sleeper',
  )
  const toggleId = `median-${season.leagueId}`

  return (
    <section className="season" id={`season-${season.season}`}>
      <header className="season__header">
        <div>
          <h2 className="season__title">{season.season}</h2>
          <p className="season__subtitle">{subtitleParts.join(' · ')}</p>
        </div>
        <label className="toggle" htmlFor={toggleId}>
          <input
            type="checkbox"
            id={toggleId}
            checked={medianOn}
            onChange={(e) => setMedianOn(e.target.checked)}
          />
          <span className="toggle__track" aria-hidden="true" />
          <span className="toggle__label">Games vs. median</span>
        </label>
      </header>
      {played === 0 ? (
        <p className="empty">Standings will appear once the first week is scored.</p>
      ) : (
        <StandingsTable season={season} medianOn={medianOn} highlightOwnerId={highlightOwnerId} />
      )}
    </section>
  )
}
