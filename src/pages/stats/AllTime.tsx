import { useMemo } from 'react'
import Avatar from '../../components/Avatar.tsx'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import HistoryStatus from '../../components/HistoryStatus.tsx'
import { useLeague } from '../../context/LeagueContext.tsx'
import { careers, type OwnerCareer } from '../../features/standings/alltime.ts'
import { fmtPts, recordSortValue, teamAvatarSrc } from '../../features/standings/SeasonTable.tsx'
import { formatRecord } from '../../features/standings/standings.ts'
import { ordinal } from '../team/TeamPage.tsx'

export default function AllTime() {
  const { history, me } = useLeague()
  const rows = useMemo(() => (history.data ? careers(history.data) : []), [history.data])
  const columns = useMemo<SortColumn<OwnerCareer>[]>(
    () => [
      { key: 'manager', label: 'Manager', get: (c) => c.ownerName },
      { key: 'seasons', label: 'Seasons', get: (c) => c.seasonsPlayed, className: 'num' },
      { key: 'record', label: 'Record', get: (c) => recordSortValue(c.h2h), className: 'num' },
      { key: 'winpct', label: 'Win %', get: (c) => c.winPct, className: 'num' },
      { key: 'median', label: 'vs Med', get: (c) => recordSortValue(c.median), className: 'num' },
      { key: 'pf', label: 'PF', get: (c) => c.pointsFor, className: 'num' },
      { key: 'pa', label: 'PA', get: (c) => c.pointsAgainst, className: 'num' },
      {
        key: 'avgrank',
        label: 'Avg rank',
        get: (c) => c.averageRank,
        defaultDir: 'asc',
        className: 'num',
      },
      { key: 'titles', label: 'Titles', get: (c) => c.championships, className: 'num' },
      {
        key: 'bestweek',
        label: 'Best week',
        get: (c) => c.highestWeek?.points ?? null,
        className: 'num',
      },
    ],
    [],
  )
  const { sort, toggle, sorted } = useSortable(rows, columns)

  return (
    <div className="stack">
      <HistoryStatus />
      {history.data && (
        <div className="card">
          <div className="card-header">
            <h2>All-time standings</h2>
            <span className="muted small">
              Regular season, {history.data.seasons.length} season
              {history.data.seasons.length === 1 ? '' : 's'} · ranked by titles, then win %
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  {columns.map((c) => (
                    <SortableTh key={c.key} column={c} sort={sort} onToggle={toggle} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <tr
                    key={c.ownerId}
                    className={c.ownerId === me?.sleeper_user_id ? 'me' : undefined}
                  >
                    <td className="num muted">{i + 1}</td>
                    <td>
                      <div className="team team--nowrap">
                        <Avatar src={teamAvatarSrc(c.avatarSrc)} name={c.ownerName} />
                        <div className="team__names">
                          <div className="team__name">{c.ownerName}</div>
                          <div className="team__owner">{c.latestTeamName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{c.seasonsPlayed}</td>
                    <td className="num nowrap">{formatRecord(c.h2h)}</td>
                    <td className="num">{(c.winPct * 100).toFixed(1)}</td>
                    <td className="num nowrap">{formatRecord(c.median)}</td>
                    <td className="num">{fmtPts(c.pointsFor)}</td>
                    <td className="num">{fmtPts(c.pointsAgainst)}</td>
                    <td className="num">{c.averageRank ?? '—'}</td>
                    <td className="num">
                      {c.championships > 0 ? `🏆 ${c.championships}` : ''}
                      {c.championships === 0 && c.bestFinish ? (
                        <span className="muted">{ordinal(c.bestFinish)}</span>
                      ) : null}
                      {c.championships === 0 && !c.bestFinish ? '—' : null}
                    </td>
                    <td className="num nowrap">
                      {c.highestWeek ? (
                        <>
                          {fmtPts(c.highestWeek.points)}{' '}
                          <span className="muted small">
                            {c.highestWeek.season} wk {c.highestWeek.week}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small mt">
            Managers are matched across seasons by their Sleeper account. &quot;Avg rank&quot; is
            the mean regular-season finish over completed seasons. More advanced stats are coming —
            use &quot;Suggest a stat&quot; to ask for one.
          </p>
        </div>
      )}
    </div>
  )
}
