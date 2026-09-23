/*
 * All-time head-to-head records between every pair of managers (regular
 * season games, matched across seasons by Sleeper account).
 */
import type { LeagueHistory } from '../standings/history.ts'
import type { RecordLine } from '../standings/standings.ts'
import { addResult, emptyLine, result, round, teamById, weeklySeasons } from './common.ts'

export interface Ledger {
  ownerId: string
  opponentId: string
  record: RecordLine
  pointsFor: number
  pointsAgainst: number
  games: number
  /** Most recent meeting. */
  last: { season: string; week: number; points: number; opponentPoints: number } | null
}

export interface Rivalries {
  /** Owners in display order, with their latest names. */
  owners: { ownerId: string; ownerName: string }[]
  /** ledger(a, b) is a's record against b. */
  ledger: (ownerId: string, opponentId: string) => Ledger | undefined
  /** Every pairing that has met, from the first owner's side. */
  all: Ledger[]
}

export function rivalries(history: LeagueHistory): Rivalries {
  const map = new Map<string, Ledger>()
  const names = new Map<string, string>()
  const key = (a: string, b: string) => `${a}|${b}`
  // Oldest first, so `last` ends on the newest meeting and names are current.
  for (const season of weeklySeasons(history).slice().reverse()) {
    const teams = teamById(season)
    for (const t of season.teams) {
      if (!t.ownerId) continue
      names.set(t.ownerId, t.ownerName)
      for (const w of t.weekly.slice().sort((a, b) => a.week - b.week)) {
        const opp = teams.get(w.opponentRosterId)
        if (!opp?.ownerId || opp.ownerId === t.ownerId) continue
        const k = key(t.ownerId, opp.ownerId)
        const row = map.get(k) ?? {
          ownerId: t.ownerId,
          opponentId: opp.ownerId,
          record: emptyLine(),
          pointsFor: 0,
          pointsAgainst: 0,
          games: 0,
          last: null,
        }
        addResult(row.record, result(w.points, w.opponentPoints))
        row.pointsFor = round(row.pointsFor + w.points)
        row.pointsAgainst = round(row.pointsAgainst + w.opponentPoints)
        row.games++
        row.last = {
          season: season.season,
          week: w.week,
          points: w.points,
          opponentPoints: w.opponentPoints,
        }
        map.set(k, row)
      }
    }
  }
  const owners = [...names.entries()]
    .map(([ownerId, ownerName]) => ({ ownerId, ownerName }))
    .sort((a, b) => a.ownerName.localeCompare(b.ownerName))
  return {
    owners,
    ledger: (a, b) => map.get(key(a, b)),
    all: [...map.values()],
  }
}
