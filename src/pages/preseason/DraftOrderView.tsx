import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../../components/Avatar.tsx'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import {
  loadSleeperDraftOrders,
  type SleeperDraftOrder,
} from '../../features/draft/sleeperDrafts.ts'
import type { DraftOrder, DraftOrderEntry } from '../../lib/db.ts'

/** One season's draft order, whichever source it came from. */
interface ShownOrder {
  key: string
  season: number
  leagueName: string
  entries: DraftOrderEntry[]
  source: 'published' | 'sleeper'
  published?: DraftOrder
  sleeper?: SleeperDraftOrder
}

export default function DraftOrderView() {
  const { draftOrders, settings, me, nameOf, isCommissioner } = useLeague()
  const leagueId = settings?.sleeper_league_id ?? null

  // Past drafts from Sleeper fill in every season the lottery didn't publish.
  const [history, setHistory] = useState<{
    loading: boolean
    error: string | null
    orders: SleeperDraftOrder[]
  }>({
    loading: false,
    error: null,
    orders: [],
  })
  useEffect(() => {
    if (!leagueId) return
    let active = true
    setHistory({ loading: true, error: null, orders: [] })
    loadSleeperDraftOrders(leagueId)
      .then((orders) => {
        if (active) setHistory({ loading: false, error: null, orders })
      })
      .catch((err: unknown) => {
        if (active) setHistory({ loading: false, error: errorMessage(err), orders: [] })
      })
    return () => {
      active = false
    }
  }, [leagueId])

  const shownOrders = useMemo<ShownOrder[]>(() => {
    const sleeperBySeason = new Map(history.orders.map((o) => [o.season, o]))
    const list: ShownOrder[] = []
    // Published (lottery) orders come first for their season; the Sleeper
    // draft for the same season stays listed so the two can be compared.
    for (const d of draftOrders) {
      list.push({
        key: `published-${d.id}`,
        season: d.season,
        leagueName: d.league_name,
        entries: d.entries,
        source: 'published',
        published: d,
        sleeper: sleeperBySeason.get(d.season),
      })
    }
    for (const o of history.orders) {
      list.push({
        key: `sleeper-${o.leagueId}`,
        season: o.season,
        leagueName: o.leagueName,
        entries: o.entries,
        source: 'sleeper',
        sleeper: o,
      })
    }
    return list.sort(
      (a, b) =>
        b.season - a.season ||
        (a.source === 'published' ? -1 : 1) - (b.source === 'published' ? -1 : 1),
    )
  }, [history.orders, draftOrders])

  const [chosenKey, setChosenKey] = useState<string | null>(null)
  const current = shownOrders.find((o) => o.season === settings?.season) ?? shownOrders[0] ?? null
  const shown = (chosenKey ? shownOrders.find((o) => o.key === chosenKey) : null) ?? current

  if (!shown) {
    return (
      <div className="card">
        <h2>No draft order yet</h2>
        {history.loading && <p className="muted">Looking up past drafts on Sleeper…</p>}
        {history.error && (
          <p className="error small">Could not read past drafts from Sleeper: {history.error}</p>
        )}
        {!history.loading && (
          <p className="muted">
            {isCommissioner ? (
              <>
                Run the <Link to="/preseason/lottery">lottery</Link> and press &quot;Publish to the
                league&quot; on the results screen. Past seasons&apos; orders appear here
                automatically from Sleeper once a draft has been held.
              </>
            ) : (
              'The commissioner publishes the draft order here after the lottery; past seasons come from Sleeper automatically.'
            )}
          </p>
        )}
      </div>
    )
  }

  const mine = shown.entries.find((e) => e.sleeperUserId && e.sleeperUserId === me?.sleeper_user_id)
  const sleeperMatches =
    shown.source === 'published' && shown.sleeper
      ? shown.sleeper.entries.every(
          (e) => shown.entries.find((p) => p.slot === e.slot)?.sleeperUserId === e.sleeperUserId,
        )
      : null

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h2>
            {shown.season} draft order · {shown.leagueName}
          </h2>
          <div className="row">
            <span className={`badge ${shown.source === 'published' ? 'gold' : ''}`}>
              {shown.source === 'published' ? 'Lottery result' : 'From Sleeper draft'}
            </span>
            {shownOrders.length > 1 && (
              <select
                aria-label="Season"
                style={{ width: 'auto', padding: '0.3rem 0.45rem' }}
                value={shown.key}
                onChange={(e) => setChosenKey(e.target.value)}
              >
                {shownOrders.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.season}
                    {o.source === 'sleeper' ? ' (Sleeper)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {mine && (
          <div className="banner success mb">
            You pick{shown.season < (settings?.season ?? 0) ? 'ed' : ''}{' '}
            <strong>#{mine.slot}</strong>
            {mine.seed ? ` (entered the lottery as seed ${mine.seed})` : ''}.
          </div>
        )}
        {sleeperMatches === false && (
          <div className="banner warn mb small">
            Sleeper&apos;s draft for {shown.season} was held in a different order than this
            published result. Pick &quot;{shown.season} (Sleeper)&quot; above to see the order
            actually used.
          </div>
        )}
        <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: '0.4rem' }}>
          {shown.entries.map((e) => {
            const movement = e.seed !== null ? e.seed - e.slot : null
            const isMe = e.sleeperUserId && e.sleeperUserId === me?.sleeper_user_id
            return (
              <li
                key={e.slot}
                className="row"
                style={{
                  gap: '0.75rem',
                  flexWrap: 'nowrap',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 10,
                  background: e.slot === 1 ? 'rgba(212,175,55,0.14)' : 'var(--bg-elev-2)',
                  boxShadow: isMe ? 'inset 3px 0 0 var(--accent)' : undefined,
                }}
              >
                <span
                  className="num"
                  style={{
                    width: '2rem',
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    color: e.slot === 1 ? 'var(--gold)' : 'var(--muted)',
                  }}
                >
                  {e.slot}
                </span>
                <Avatar src={e.avatarUrl} name={e.teamName} />
                <div className="team__names" style={{ flex: 1 }}>
                  <div className="team__name">{e.teamName}</div>
                  <div className="team__owner">
                    {e.ownerName}
                    {e.record ? ` · ${e.record} last season` : ''}
                  </div>
                </div>
                {movement !== null && (
                  <span
                    className={`small ${movement > 0 ? 'success' : movement < 0 ? 'error' : 'muted'}`}
                    style={{ fontWeight: 600 }}
                  >
                    {movement > 0 ? `▲${movement}` : movement < 0 ? `▼${-movement}` : '—'}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
        <p className="muted small mt" style={{ marginBottom: 0 }}>
          {shown.source === 'published' && shown.published ? (
            <>
              Published by {nameOf(shown.published.created_by)} on{' '}
              {new Date(shown.published.updated_at).toLocaleDateString()}.
              {shown.published.lottery && (
                <>
                  {' '}
                  Lottery seed <code>{shown.published.lottery.seedUsed}</code> — anyone can replay
                  it on the lottery page to verify the draw.
                </>
              )}
            </>
          ) : shown.sleeper ? (
            <>
              The {shown.sleeper.draftType} draft order recorded on Sleeper
              {shown.sleeper.startTime
                ? `, held ${new Date(shown.sleeper.startTime).toLocaleDateString()}`
                : ''}
              {shown.sleeper.status !== 'complete'
                ? ` (draft ${shown.sleeper.status.replace('_', ' ')})`
                : ''}
              .
            </>
          ) : null}
        </p>
      </div>
      {history.loading && <p className="muted small">Looking up past drafts on Sleeper…</p>}
      {history.error && (
        <p className="error small">Could not read past drafts from Sleeper: {history.error}</p>
      )}
    </div>
  )
}
