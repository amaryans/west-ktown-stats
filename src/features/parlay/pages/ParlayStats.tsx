import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { SortableTh, useSortable, type SortColumn } from '../../../components/sortable.tsx'
import type { Week } from '../../../lib/db.ts'
import { useLeague } from '../../../context/LeagueContext.tsx'
import { useParlay } from '../ParlayContext.tsx'
import { formatAmerican, formatMoney, formatPct, parlayOdds } from '../lib/odds.ts'
import {
  computeLeagueStats,
  computeMemberStats,
  rankMembers,
  type MemberStats,
} from '../lib/stats.ts'
import { weekLabel } from '../lib/week.ts'
import { ResultBadge } from '../components/Badges.tsx'

export default function ParlayStats() {
  const { profiles, me, nameOf } = useLeague()
  const { weeks, legs, legsForWeek } = useParlay()
  const members = rankMembers(computeMemberStats({ profiles, weeks, legs }))
  const league = computeLeagueStats({ weeks, legs })
  const settledWeeks = useMemo(() => weeks.filter((w) => w.parlay_result !== 'pending'), [weeks])

  const memberColumns = useMemo<SortColumn<MemberStats>[]>(
    () => [
      { key: 'member', label: 'Member', get: (m) => m.profile.display_name },
      { key: 'wlp', label: 'W-L-P', get: (m) => m.won * 1000 - m.lost, className: 'num' },
      { key: 'hit', label: 'Hit %', get: (m) => m.hitRate, className: 'num' },
      { key: 'avgodds', label: 'Avg odds', get: (m) => m.avgOdds, className: 'num' },
      { key: 'edge', label: 'vs implied', get: (m) => m.edge, className: 'num' },
      { key: 'streak', label: 'Streak', get: (m) => m.currentStreak, className: 'num' },
      { key: 'best', label: 'Best', get: (m) => m.bestStreak, className: 'num' },
      { key: 'placed', label: 'Placed', get: (m) => m.timesLoser, className: 'num' },
      {
        key: 'net',
        label: 'Placer net',
        get: (m) => (m.timesLoser ? m.net : null),
        className: 'num',
      },
    ],
    [],
  )
  const memberSort = useSortable(members, memberColumns)
  const rankOf = useMemo(() => new Map(members.map((m, i) => [m.profile.id, i + 1])), [members])

  const historyColumns = useMemo<SortColumn<Week>[]>(
    () => [
      { key: 'week', label: 'Week', get: (w) => w.season * 100 + w.week, defaultDir: 'desc' },
      { key: 'placer', label: 'Placed by', get: (w) => (w.loser_id ? nameOf(w.loser_id) : null) },
      { key: 'legs', label: 'Legs', get: (w) => legsForWeek(w.id).length, className: 'num' },
      {
        key: 'odds',
        label: 'Odds',
        get: (w) => parlayOdds(legsForWeek(w.id)).decimal,
        className: 'num',
      },
      { key: 'stake', label: 'Stake', get: (w) => Number(w.stake), className: 'num' },
      {
        key: 'payout',
        label: 'Payout',
        get: (w) => historyPayout(w, legsForWeek(w.id)),
        className: 'num',
      },
      { key: 'result', label: 'Result', get: (w) => w.parlay_result },
    ],
    [nameOf, legsForWeek],
  )
  const historySort = useSortable(settledWeeks, historyColumns)

  // Superlatives: everyone tied at the top gets named, nobody is crowned on a tie.
  const leaders = (list: MemberStats[], key: 'timesLoser' | 'net' | 'parlaysSunk') => {
    const top = Math.max(...list.map((m) => m[key]), -Infinity)
    const names = list.filter((m) => m[key] === top).map((m) => m.profile.display_name)
    return { top, names: names.join(' & ') }
  }
  const mostLoser = leaders(members, 'timesLoser')
  const placers = members.filter((m) => m.timesLoser > 0 && m.parlaysWon + m.parlaysLost > 0)
  const luckiest = placers.length ? leaders(placers, 'net') : null
  const sinker = leaders(members, 'parlaysSunk')

  return (
    <div className="stack">
      <div className="card">
        <h2>League stats</h2>
        <div className="stat-tiles">
          <div className="tile">
            <div className="label">Parlays settled</div>
            <div className="value">{league.placed}</div>
            <div className="sub">
              {league.won} won · {league.lost} lost
            </div>
          </div>
          <div className="tile">
            <div className="label">Leg hit rate</div>
            <div className="value">{formatPct(league.legHitRate)}</div>
            <div className="sub">{league.totalLegs} legs picked</div>
          </div>
          <div className="tile">
            <div className="label">Total staked</div>
            <div className="value">{formatMoney(league.staked)}</div>
          </div>
          <div className="tile">
            <div className="label">Net</div>
            <div className={`value ${league.net > 0 ? 'success' : league.net < 0 ? 'error' : ''}`}>
              {formatMoney(league.net)}
            </div>
            <div className="sub">returned {formatMoney(league.returned)}</div>
          </div>
          {league.biggestHit && (
            <div className="tile">
              <div className="label">Biggest hit</div>
              <div className="value">{formatMoney(league.biggestHit.payout)}</div>
              <div className="sub">
                {weekLabel(league.biggestHit.week.week)} · {nameOf(league.biggestHit.week.loser_id)}
              </div>
            </div>
          )}
        </div>
        {league.placed > 0 && (
          <div className="grid mt">
            {mostLoser.top > 0 && (
              <Superlative
                label="Most parlays placed"
                name={mostLoser.names}
                detail={`${mostLoser.top} time${mostLoser.top === 1 ? '' : 's'} as the loser`}
              />
            )}
            {luckiest && (
              <Superlative
                label="Best luck as placer"
                name={luckiest.names}
                detail={`${formatMoney(luckiest.top)} net`}
              />
            )}
            {sinker.top > 0 && (
              <Superlative
                label="Parlay killer"
                name={sinker.names}
                detail={`${sinker.top} losing leg${sinker.top === 1 ? '' : 's'}`}
              />
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Leaderboard: best pickers</h2>
          <span className="muted small">Ranked by hit rate (3+ settled legs to qualify)</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="rank">#</th>
                {memberColumns.map((c) => (
                  <SortableTh
                    key={c.key}
                    column={c}
                    sort={memberSort.sort}
                    onToggle={memberSort.toggle}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {memberSort.sorted.map((m) => (
                <tr
                  key={m.profile.id}
                  className={
                    m.profile.id === me?.id ? 'me' : m.won + m.lost === 0 ? 'dim' : undefined
                  }
                >
                  <td className="rank">{m.won + m.lost >= 3 ? rankOf.get(m.profile.id) : '–'}</td>
                  <td className="nowrap">{m.profile.display_name}</td>
                  <td className="num nowrap">
                    {m.won}-{m.lost}-{m.push}
                    {m.pending ? <span className="muted"> ({m.pending} open)</span> : null}
                  </td>
                  <td className="num">{formatPct(m.hitRate)}</td>
                  <td className="num">{formatAmerican(m.avgOdds)}</td>
                  <td
                    className={`num ${(m.edge ?? 0) > 0 ? 'success' : (m.edge ?? 0) < 0 ? 'error' : ''}`}
                  >
                    {m.edge === null ? '—' : `${m.edge > 0 ? '+' : ''}${(m.edge * 100).toFixed(0)}`}
                  </td>
                  <td
                    className={`num streak ${m.currentStreak >= 3 ? 'hot' : m.currentStreak <= -3 ? 'cold' : ''}`}
                  >
                    {m.currentStreak === 0
                      ? '—'
                      : m.currentStreak > 0
                        ? `W${m.currentStreak}`
                        : `L${-m.currentStreak}`}
                  </td>
                  <td className="num">{m.bestStreak ? `W${m.bestStreak}` : '—'}</td>
                  <td className="num">{m.timesLoser}</td>
                  <td className={`num ${m.net > 0 ? 'success' : m.net < 0 ? 'error' : ''}`}>
                    {m.timesLoser ? formatMoney(m.net) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small mt">
          &quot;vs implied&quot; compares each member&apos;s actual hit rate with the win
          probability their average odds implied. Positive means they beat the book. &quot;Placer
          net&quot; is money won minus staked on the weeks they were the loser.
        </p>
      </div>

      <div className="card">
        <h2>Parlay history</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {historyColumns.map((c) => (
                  <SortableTh
                    key={c.key}
                    column={c}
                    sort={historySort.sort}
                    onToggle={historySort.toggle}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {settledWeeks.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No settled parlays yet.
                  </td>
                </tr>
              )}
              {settledWeeks.map((w) => {
                const wl = legsForWeek(w.id)
                const { american, decimal } = parlayOdds(wl)
                const payout =
                  w.parlay_result === 'won'
                    ? (w.payout ?? (decimal ? decimal * Number(w.stake) : null))
                    : null
                return (
                  <tr key={w.id}>
                    <td className="nowrap">
                      <Link to={`/parlay/weeks/${w.season}/${w.week}`}>{weekLabel(w.week)}</Link>{' '}
                      <span className="muted small">{w.season}</span>
                    </td>
                    <td>{w.loser_id ? nameOf(w.loser_id) : '—'}</td>
                    <td className="num">{wl.length}</td>
                    <td className="num">{formatAmerican(american)}</td>
                    <td className="num">{formatMoney(w.stake)}</td>
                    <td className="num">{payout !== null ? formatMoney(payout) : '—'}</td>
                    <td>
                      <ResultBadge result={w.parlay_result} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function historyPayout(w: Week, legs: Parameters<typeof parlayOdds>[0]): number | null {
  if (w.parlay_result !== 'won') return null
  if (w.payout !== null && w.payout !== undefined) return Number(w.payout)
  const { decimal } = parlayOdds(legs)
  return decimal ? decimal * Number(w.stake) : null
}

function Superlative({ label, name, detail }: { label: string; name: string; detail: string }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value text">{name}</div>
      <div className="sub">{detail}</div>
    </div>
  )
}
