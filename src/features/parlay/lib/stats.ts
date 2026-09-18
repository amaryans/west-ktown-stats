import type { Leg, Profile, Week } from '../../../lib/db.ts'
import {
  americanToDecimal,
  decimalToAmerican,
  impliedProbability,
  isCountedLeg,
  parlayOdds,
} from './odds.ts'

export interface MemberStats {
  profile: Profile
  legs: number
  won: number
  lost: number
  push: number
  pending: number
  hitRate: number | null
  avgOdds: number | null
  avgImplied: number | null
  /** Actual hit rate minus average implied probability. */
  edge: number | null
  /** Positive = wins in a row, negative = losses. */
  currentStreak: number
  bestStreak: number
  timesLoser: number
  parlaysWon: number
  parlaysLost: number
  parlaysPending: number
  staked: number
  returned: number
  net: number
  /** A member "sank" a parlay when their leg lost (regardless of others). */
  parlaysSunk: number
}

function weekPayout(w: Week, legs: readonly Leg[]): number {
  const stake = Number(w.stake) || 0
  return w.payout !== null && w.payout !== undefined
    ? Number(w.payout)
    : (parlayOdds(legs).decimal ?? 0) * stake
}

/** Per-member picking stats and parlay-placing stats, computed client side. */
export function computeMemberStats({
  profiles,
  weeks,
  legs,
}: {
  profiles: readonly Profile[]
  weeks: readonly Week[]
  legs: readonly Leg[]
}): MemberStats[] {
  const byUser = new Map<string, MemberStats>()
  for (const p of profiles) {
    byUser.set(p.id, {
      profile: p,
      legs: 0,
      won: 0,
      lost: 0,
      push: 0,
      pending: 0,
      hitRate: null,
      avgOdds: null,
      avgImplied: null,
      edge: null,
      currentStreak: 0,
      bestStreak: 0,
      timesLoser: 0,
      parlaysWon: 0,
      parlaysLost: 0,
      parlaysPending: 0,
      staked: 0,
      returned: 0,
      net: 0,
      parlaysSunk: 0,
    })
  }

  const weekById = new Map(weeks.map((w) => [w.id, w]))
  const legsByWeek = new Map<string, Leg[]>()
  for (const l of legs) {
    const list = legsByWeek.get(l.week_id) ?? []
    list.push(l)
    legsByWeek.set(l.week_id, list)
  }

  // Legs, in chronological order for streaks.
  const orderedLegs = [...legs].sort((a, b) => {
    const wa = weekById.get(a.week_id)
    const wb = weekById.get(b.week_id)
    return (wa?.season ?? 0) - (wb?.season ?? 0) || (wa?.week ?? 0) - (wb?.week ?? 0) || 0
  })

  const oddsAcc = new Map<string, { dec: number; imp: number; n: number }>()
  for (const leg of orderedLegs) {
    const s = byUser.get(leg.user_id)
    if (!s) continue
    s.legs += 1
    if (leg.result === 'won') s.won += 1
    else if (leg.result === 'lost') s.lost += 1
    else if (leg.result === 'push' || leg.result === 'void') s.push += 1
    else s.pending += 1

    if (leg.odds !== null && leg.odds !== undefined) {
      const acc = oddsAcc.get(leg.user_id) ?? { dec: 0, imp: 0, n: 0 }
      acc.dec += americanToDecimal(leg.odds) ?? 0
      acc.imp += impliedProbability(leg.odds) ?? 0
      acc.n += 1
      oddsAcc.set(leg.user_id, acc)
    }

    if (leg.result === 'won') {
      s.currentStreak = s.currentStreak > 0 ? s.currentStreak + 1 : 1
      s.bestStreak = Math.max(s.bestStreak, s.currentStreak)
    } else if (leg.result === 'lost') {
      s.currentStreak = s.currentStreak < 0 ? s.currentStreak - 1 : -1
      s.parlaysSunk += 1
    }
  }

  for (const [id, s] of byUser) {
    const settled = s.won + s.lost
    s.hitRate = settled ? s.won / settled : null
    const acc = oddsAcc.get(id)
    if (acc && acc.n) {
      s.avgOdds = decimalToAmerican(acc.dec / acc.n)
      s.avgImplied = acc.imp / acc.n
      s.edge = s.hitRate !== null ? s.hitRate - s.avgImplied : null
    }
  }

  for (const w of weeks) {
    if (!w.loser_id) continue
    const s = byUser.get(w.loser_id)
    if (!s) continue
    s.timesLoser += 1
    const stake = Number(w.stake) || 0
    if (w.parlay_result === 'won') {
      s.parlaysWon += 1
      s.staked += stake
      s.returned += weekPayout(w, legsByWeek.get(w.id) ?? [])
    } else if (w.parlay_result === 'lost') {
      s.parlaysLost += 1
      s.staked += stake
    } else if (w.parlay_result === 'push' || w.parlay_result === 'void') {
      s.staked += stake
      s.returned += stake
    } else {
      s.parlaysPending += 1
    }
    s.net = s.returned - s.staked
  }

  return [...byUser.values()]
}

export interface LeagueStats {
  placed: number
  won: number
  lost: number
  staked: number
  returned: number
  net: number
  biggestHit: { week: Week; payout: number } | null
  legHitRate: number | null
  totalLegs: number
}

export function computeLeagueStats({
  weeks,
  legs,
}: {
  weeks: readonly Week[]
  legs: readonly Leg[]
}): LeagueStats {
  const legsByWeek = new Map<string, Leg[]>()
  for (const l of legs) {
    const list = legsByWeek.get(l.week_id) ?? []
    list.push(l)
    legsByWeek.set(l.week_id, list)
  }
  let placed = 0
  let won = 0
  let lost = 0
  let staked = 0
  let returned = 0
  let biggestHit: LeagueStats['biggestHit'] = null
  for (const w of weeks) {
    if (w.parlay_result === 'pending') continue
    const stake = Number(w.stake) || 0
    placed += 1
    staked += stake
    if (w.parlay_result === 'won') {
      won += 1
      const payout = weekPayout(w, legsByWeek.get(w.id) ?? [])
      returned += payout
      if (!biggestHit || payout > biggestHit.payout) biggestHit = { week: w, payout }
    } else if (w.parlay_result === 'lost') {
      lost += 1
    } else {
      returned += stake
    }
  }
  const settledLegs = legs.filter((l) => l.result === 'won' || l.result === 'lost')
  const wonLegs = legs.filter((l) => l.result === 'won').length
  return {
    placed,
    won,
    lost,
    staked,
    returned,
    net: returned - staked,
    biggestHit,
    legHitRate: settledLegs.length ? wonLegs / settledLegs.length : null,
    totalLegs: legs.filter(isCountedLeg).length,
  }
}

/** Sort for the leaderboard: hit rate desc (min 3 settled legs to rank), then wins, then fewer losses. */
export function rankMembers(stats: readonly MemberStats[]): MemberStats[] {
  return [...stats].sort((a, b) => {
    const aq = a.won + a.lost >= 3
    const bq = b.won + b.lost >= 3
    if (aq !== bq) return aq ? -1 : 1
    if ((b.hitRate ?? -1) !== (a.hitRate ?? -1)) return (b.hitRate ?? -1) - (a.hitRate ?? -1)
    if (b.won !== a.won) return b.won - a.won
    if (a.lost !== b.lost) return a.lost - b.lost
    return a.profile.display_name.localeCompare(b.profile.display_name)
  })
}
