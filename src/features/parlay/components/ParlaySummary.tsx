import type { Leg } from '../../../lib/db.ts'
import { formatAmerican, formatMoney, parlayOdds, potentialPayout } from '../lib/odds.ts'

export default function ParlaySummary({
  legs,
  stake,
  expectedLegs,
}: {
  legs: Leg[]
  stake: number
  expectedLegs?: number
}) {
  const { american, decimal, legCount, missingOdds } = parlayOdds(legs)
  const payout = potentialPayout(stake, legs)
  return (
    <div className="stat-tiles">
      <div className="tile">
        <div className="label">Legs</div>
        <div className="value">
          {legCount}
          {expectedLegs ? <span className="muted"> / {expectedLegs}</span> : null}
        </div>
        {missingOdds > 0 && <div className="sub">{missingOdds} missing odds</div>}
      </div>
      <div className="tile">
        <div className="label">Parlay odds</div>
        <div className="value">{formatAmerican(american)}</div>
        {decimal && <div className="sub">{decimal.toFixed(2)}x</div>}
      </div>
      <div className="tile">
        <div className="label">Stake</div>
        <div className="value">{formatMoney(stake)}</div>
      </div>
      <div className="tile">
        <div className="label">To win</div>
        <div className="value">{payout ? formatMoney(payout - Number(stake)) : '—'}</div>
        {payout && <div className="sub">pays {formatMoney(payout)}</div>}
      </div>
    </div>
  )
}
