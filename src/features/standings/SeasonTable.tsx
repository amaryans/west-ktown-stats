import { useMemo, useState } from 'react'
import Avatar from '../../components/Avatar.tsx'
import { SortableTh, SortSelect, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { sleeperAvatarUrl } from '../../lib/sleeper/client.ts'
import type { SeasonStandings } from './history.ts'
import {
  formatRecord,
  rank,
  winPct,
  type RankedTeam,
  type RecordLine,
  type SeasonTeam,
} from './standings.ts'

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
  const ranked = useMemo(
    () => rank(season.teams, medianOn ? 'combined' : 'h2h'),
    [season.teams, medianOn],
  )
  const columns = useMemo<SortColumn<RankedTeam>[]>(
    () => [
      {
        key: 'rank',
        label: '#',
        title: 'Rank',
        get: (t) => t.rank,
        defaultDir: 'asc',
        className: 'col-rank',
      },
      { key: 'team', label: 'Team', get: (t) => t.teamName, className: 'col-team' },
      { key: 'record', label: 'Record', get: (t) => recordSortValue(t.h2h), className: 'col-num' },
      ...(medianOn
        ? [
            {
              key: 'median',
              label: 'vs Median',
              get: (t: RankedTeam) => recordSortValue(t.median),
              className: 'col-num',
            },
            {
              key: 'overall',
              label: 'Overall',
              get: (t: RankedTeam) => recordSortValue(t.combined),
              className: 'col-num col-strong',
            },
          ]
        : []),
      {
        key: 'pf',
        label: 'PF',
        title: 'Points for',
        get: (t) => t.pointsFor,
        className: 'col-num',
      },
      {
        key: 'pa',
        label: 'PA',
        title: 'Points against',
        get: (t) => t.pointsAgainst,
        className: 'col-num',
      },
    ],
    [medianOn],
  )
  const { sort, setSort, toggle, sorted } = useSortable(ranked, columns)
  return (
    <>
      {/* The header (and its sort buttons) is hidden on phones, so offer a picker there. */}
      <div className="standings-sort">
        <SortSelect columns={columns} sort={sort} onChange={setSort} />
      </div>
      <div className="table-wrap">
        <table className={'standings' + (medianOn ? ' standings--median' : '')}>
          <thead>
            <tr>
              {columns.map((c) => (
                <SortableTh key={c.key} column={c} sort={sort} onToggle={toggle} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
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
    </>
  )
}

/** Records sort by win percentage, then by wins, so 10-4 beats 9-4-1 beats 5-9. */
export function recordSortValue(line: RecordLine): number {
  return winPct(line) * 1000 + line.wins
}

export default function SeasonSection({
  season,
  highlightOwnerId,
}: {
  season: SeasonStandings
  highlightOwnerId?: string | null
}) {
  const [medianOn, setMedianOn] = useState(season.medianEnabled)
  const manual = season.source === 'manual'
  const played = season.weeksPlayed.length
  const subtitleParts: string[] = []
  if (manual) {
    subtitleParts.push(
      `Final standings${season.sourceName ? ` from ${season.sourceName}` : ''}, before Sleeper`,
    )
    subtitleParts.push('No weekly data, so no games vs. median')
  } else {
    if (played === 0) subtitleParts.push('No games played yet')
    else subtitleParts.push(`Regular season · ${played} week${played === 1 ? '' : 's'}`)
    if (season.status === 'in_season') subtitleParts.push('In progress')
    subtitleParts.push(
      season.medianEnabled ? 'League median was on in Sleeper' : 'League median was off in Sleeper',
    )
  }
  const toggleId = `median-${season.leagueId}`

  return (
    <section className="season" id={`season-${season.season}`}>
      <header className="season__header">
        <div>
          <h2 className="season__title">{season.season}</h2>
          <p className="season__subtitle">{subtitleParts.join(' · ')}</p>
        </div>
        {!manual && (
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
        )}
      </header>
      {played === 0 && !manual ? (
        <p className="empty">Standings will appear once the first week is scored.</p>
      ) : (
        <StandingsTable
          season={season}
          medianOn={medianOn && !manual}
          highlightOwnerId={highlightOwnerId}
        />
      )}
    </section>
  )
}
