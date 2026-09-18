import { useMemo } from 'react'
import Avatar from '../../components/Avatar.tsx'
import HistoryStatus from '../../components/HistoryStatus.tsx'
import { useLeague } from '../../context/LeagueContext.tsx'
import { careers } from '../../features/standings/alltime.ts'
import { fmtPts, teamAvatarSrc } from '../../features/standings/SeasonTable.tsx'
import { formatRecord } from '../../features/standings/standings.ts'
import { ordinal } from '../team/TeamPage.tsx'

export default function AllTime() {
  const { history, me } = useLeague()
  const rows = useMemo(() => (history.data ? careers(history.data) : []), [history.data])

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
                  <th>Manager</th>
                  <th className="num">Seasons</th>
                  <th className="num">Record</th>
                  <th className="num">Win %</th>
                  <th className="num">vs Med</th>
                  <th className="num">PF</th>
                  <th className="num">PA</th>
                  <th className="num">Avg rank</th>
                  <th className="num">Titles</th>
                  <th className="num">Best week</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
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
