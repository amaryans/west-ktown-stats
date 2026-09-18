import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../../components/Avatar.tsx'
import { useLeague } from '../../context/LeagueContext.tsx'

export default function DraftOrderView() {
  const { draftOrders, settings, me, nameOf, isCommissioner } = useLeague()
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const current = draftOrders.find((d) => d.season === settings?.season) ?? draftOrders[0] ?? null
  const shown = (seasonId ? draftOrders.find((d) => d.id === seasonId) : null) ?? current

  if (!shown) {
    return (
      <div className="card">
        <h2>No draft order published yet</h2>
        <p className="muted">
          {isCommissioner ? (
            <>
              Run the <Link to="/preseason/lottery">lottery</Link> and press &quot;Publish to the
              league&quot; on the results screen. The order will show up here for everyone.
            </>
          ) : (
            'The commissioner publishes the draft order here after the lottery.'
          )}
        </p>
      </div>
    )
  }

  const mine = shown.entries.find((e) => e.sleeperUserId && e.sleeperUserId === me?.sleeper_user_id)

  return (
    <div className="stack">
      <div className="card">
        <div className="card-header">
          <h2>
            {shown.season} draft order · {shown.league_name}
          </h2>
          {draftOrders.length > 1 && (
            <select
              aria-label="Season"
              style={{ width: 'auto', padding: '0.3rem 0.45rem' }}
              value={shown.id}
              onChange={(e) => setSeasonId(e.target.value)}
            >
              {draftOrders.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.season}
                </option>
              ))}
            </select>
          )}
        </div>
        {mine && (
          <div className="banner success mb">
            You pick <strong>#{mine.slot}</strong>
            {mine.seed ? ` (entered the lottery as seed ${mine.seed})` : ''}.
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
          Published by {nameOf(shown.created_by)} on{' '}
          {new Date(shown.updated_at).toLocaleDateString()}.
          {shown.lottery && (
            <>
              {' '}
              Lottery seed <code>{shown.lottery.seedUsed}</code> — anyone can replay it on the
              lottery page to verify the draw.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
