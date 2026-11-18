/**
 * The "what if" picker's pure half: picked results become fixed results for
 * the exact clinch check, and each team's record and status before and after.
 */
import {
  byeCount,
  clinchStatuses,
  forecastKey,
  type ClinchStatus,
  type ScheduledGame,
  type WeekResult,
} from './engine/index.ts'
import type { PredictionData } from './loader.ts'

/** Picks keyed by `gameKey` (value: winner's roster id) and `medianKey` (value: won). */
export type Picks = Record<string, number | boolean>

export function gameKey(g: ScheduledGame): string {
  return `g:${g.week}:${g.home}:${g.away}`
}

export function medianKey(week: number, rosterId: number): string {
  return `m:${week}:${rosterId}`
}

/** Picks as fixed results, in schedule order; picks for games not on the schedule are ignored. */
export function picksToResults(data: PredictionData, picks: Picks): WeekResult[] {
  const out: WeekResult[] = []
  for (const g of data.schedule) {
    const winner = picks[gameKey(g)]
    if (winner === g.home || winner === g.away) {
      out.push({
        kind: 'game',
        week: g.week,
        winner,
        loser: winner === g.home ? g.away : g.home,
      })
    }
  }
  if (data.medianGame) {
    for (const week of data.remainingWeeks) {
      for (const t of data.teams) {
        const won = picks[medianKey(week, t.rosterId)]
        if (typeof won === 'boolean') out.push({ kind: 'median', week, rosterId: t.rosterId, won })
      }
    }
  }
  return out
}

/** The projected favourite in every game of a week, and the top half against the median. */
export function favouritePicks(data: PredictionData, week: number): Picks {
  const mean = (id: number) => data.forecasts[forecastKey(id, week)]?.mean ?? 0
  const picks: Picks = {}
  for (const g of data.schedule) {
    if (g.week === week) picks[gameKey(g)] = mean(g.home) >= mean(g.away) ? g.home : g.away
  }
  if (data.medianGame) {
    const half = Math.floor(data.teams.length / 2)
    const order = data.teams.map((t) => t.rosterId).sort((a, b) => mean(b) - mean(a))
    order.forEach((id, i) => {
      picks[medianKey(week, id)] = i < half
    })
  }
  return picks
}

/** Why a set of picks cannot happen, or null when it can. */
export function picksProblem(data: PredictionData, picks: Picks): string | null {
  if (!data.medianGame) return null
  const half = Math.floor(data.teams.length / 2)
  const below = data.teams.length - half
  for (const week of data.remainingWeeks) {
    let above = 0
    let under = 0
    for (const t of data.teams) {
      const won = picks[medianKey(week, t.rosterId)]
      if (won === true) above++
      if (won === false) under++
    }
    if (above > half) return `Only ${half} teams can beat the median in week ${week}.`
    if (under > below) return `Only ${below} teams can miss the median in week ${week}.`
  }
  return null
}

export interface WhatIfRow {
  rosterId: number
  wins: number
  losses: number
  ties: number
  before: ClinchStatus
  after: ClinchStatus
  changed: boolean
}

/** Status of every team now and after the picks, best record after first. */
export function whatIf(data: PredictionData, picks: Picks): WhatIfRow[] {
  const spots = Math.min(data.playoffTeams, data.teams.length)
  const base = {
    teams: data.teams.map((t) => ({
      rosterId: t.rosterId,
      wins: t.record.wins,
      losses: t.record.losses,
      ties: t.record.ties,
      pointsFor: t.pointsFor,
    })),
    schedule: data.schedule,
    weeks: data.remainingWeeks,
    medianGame: data.medianGame,
    spots,
    byes: byeCount(spots),
  }
  const fixed = picksToResults(data, picks)
  const before = new Map(clinchStatuses(base).map((s) => [s.rosterId, s]))
  const after = new Map(clinchStatuses({ ...base, fixed }).map((s) => [s.rosterId, s]))
  const added = new Map<number, { wins: number; losses: number }>()
  const tally = (id: number, won: boolean) => {
    const r = added.get(id) ?? { wins: 0, losses: 0 }
    if (won) r.wins++
    else r.losses++
    added.set(id, r)
  }
  for (const r of fixed) {
    if (r.kind === 'game') {
      tally(r.winner, true)
      tally(r.loser, false)
    } else {
      tally(r.rosterId, r.won)
    }
  }
  const rows = base.teams.flatMap((t): WhatIfRow[] => {
    const b = before.get(t.rosterId)
    const a = after.get(t.rosterId)
    if (!b || !a) return []
    const r = added.get(t.rosterId) ?? { wins: 0, losses: 0 }
    return [
      {
        rosterId: t.rosterId,
        wins: t.wins + r.wins,
        losses: t.losses + r.losses,
        ties: t.ties,
        before: b,
        after: a,
        changed: statusLabel(a) !== statusLabel(b),
      },
    ]
  })
  // Stable sort: equal records keep the loader's order.
  return rows.sort((x, y) => y.wins - x.wins || x.losses - y.losses)
}

/** Short status text: "Bye", "Clinched", "Out" or "Alive". */
export function statusLabel(s: ClinchStatus): 'Bye' | 'Clinched' | 'Out' | 'Alive' {
  if (s.clinchedBye) return 'Bye'
  if (s.clinchedPlayoffs) return 'Clinched'
  if (s.eliminated) return 'Out'
  return 'Alive'
}
