/*
 * Weekly awards, the record book, streaks and title droughts.
 */
import { isChampion, type LeagueHistory, type SeasonStandings } from '../standings/history.ts'
import { winPct, type RecordLine } from '../standings/standings.ts'
import { round, teamById, teamRef, weeklySeasons, type TeamRef } from './common.ts'

export interface GameRecord {
  season: string
  week: number
  team: TeamRef
  opponent: TeamRef
  points: number
  opponentPoints: number
  /** points - opponentPoints */
  margin: number
}

export interface WeeklyAwards {
  season: string
  week: number
  /** Top score of the week. */
  high: GameRecord
  /** Bottom score of the week. */
  low: GameRecord
  /** Largest winning margin. */
  blowout: GameRecord
  /** Smallest winning margin (a tie counts as zero). */
  closest: GameRecord
  /** Highest score in a loss. */
  heartbreak: GameRecord | null
  /** Lowest score in a win. */
  lucky: GameRecord | null
}

/** Every game of a season, from both sides. */
export function seasonGames(season: SeasonStandings): GameRecord[] {
  const teams = teamById(season)
  const out: GameRecord[] = []
  for (const team of season.teams) {
    for (const w of team.weekly) {
      const opp = teams.get(w.opponentRosterId)
      if (!opp) continue
      out.push({
        season: season.season,
        week: w.week,
        team: teamRef(season, team),
        opponent: teamRef(season, opp),
        points: w.points,
        opponentPoints: w.opponentPoints,
        margin: round(w.points - w.opponentPoints),
      })
    }
  }
  return out
}

/** One row per game, seen from the winner's side (lower roster id on a tie). */
function winnerSide(games: GameRecord[]): GameRecord[] {
  return games.filter(
    (g) => g.margin > 0 || (g.margin === 0 && g.team.rosterId < g.opponent.rosterId),
  )
}

function best<T>(list: T[], better: (a: T, b: T) => boolean): T | null {
  let out: T | null = null
  for (const x of list) if (out === null || better(x, out)) out = x
  return out
}

export function weeklyAwards(season: SeasonStandings): WeeklyAwards[] {
  const byWeek = new Map<number, GameRecord[]>()
  for (const g of seasonGames(season)) {
    const list = byWeek.get(g.week) ?? []
    list.push(g)
    byWeek.set(g.week, list)
  }
  const out: WeeklyAwards[] = []
  for (const [week, games] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
    const high = best(games, (a, b) => a.points > b.points)
    const low = best(games, (a, b) => a.points < b.points)
    const winners = winnerSide(games)
    const blowout = best(winners, (a, b) => a.margin > b.margin)
    const closest = best(winners, (a, b) => a.margin < b.margin)
    if (!high || !low || !blowout || !closest) continue
    out.push({
      season: season.season,
      week,
      high,
      low,
      blowout,
      closest,
      heartbreak: best(
        games.filter((g) => g.margin < 0),
        (a, b) => a.points > b.points,
      ),
      lucky: best(
        games.filter((g) => g.margin > 0),
        (a, b) => a.points < b.points,
      ),
    })
  }
  return out
}

export type AwardKey = 'high' | 'low' | 'blowout' | 'closest' | 'heartbreak' | 'lucky'

export interface AwardTally {
  key: string
  ownerName: string
  teamName: string
  counts: Record<AwardKey, number>
}

/** How many times each manager took each weekly award (blowout / closest go to the winner). */
export function tallyAwards(awards: WeeklyAwards[]): AwardTally[] {
  const out = new Map<string, AwardTally>()
  const keys: AwardKey[] = ['high', 'low', 'blowout', 'closest', 'heartbreak', 'lucky']
  for (const week of awards) {
    for (const k of keys) {
      const g = week[k]
      if (!g) continue
      const id = g.team.ownerId ?? `${g.season}:${g.team.rosterId}`
      const row = out.get(id) ?? {
        key: id,
        ownerName: g.team.ownerName,
        teamName: g.team.teamName,
        counts: { high: 0, low: 0, blowout: 0, closest: 0, heartbreak: 0, lucky: 0 },
      }
      row.counts[k]++
      out.set(id, row)
    }
  }
  return [...out.values()]
}

export interface SeasonMark {
  team: TeamRef
  value: number
  record: RecordLine
}

export interface RecordBook {
  highestScores: GameRecord[]
  lowestScores: GameRecord[]
  biggestBlowouts: GameRecord[]
  closestGames: GameRecord[]
  highestInLoss: GameRecord[]
  lowestInWin: GameRecord[]
  /** Both teams' points added up; `points` holds the total. */
  highestCombined: GameRecord[]
  mostPointsSeason: SeasonMark[]
  fewestPointsSeason: SeasonMark[]
  bestRecord: SeasonMark[]
  worstRecord: SeasonMark[]
}

function top<T>(list: T[], cmp: (a: T, b: T) => number, limit: number): T[] {
  return list.slice().sort(cmp).slice(0, limit)
}

/**
 * The league's record book over the given seasons. Season marks (points,
 * record) only use completed seasons, so a hot start doesn't top the list.
 */
export function recordBook(seasons: SeasonStandings[], limit = 5): RecordBook {
  const all = seasons.flatMap(seasonGames)
  const winners = winnerSide(all)
  const marks: SeasonMark[] = seasons
    .filter((s) => s.complete)
    .flatMap((s) =>
      s.teams
        .filter((t) => t.h2h.wins + t.h2h.losses + t.h2h.ties > 0)
        .map((t) => ({ team: teamRef(s, t), value: t.pointsFor, record: t.h2h })),
    )
  const byPct = (m: SeasonMark) => winPct(m.record)
  return {
    highestScores: top(all, (a, b) => b.points - a.points, limit),
    lowestScores: top(all, (a, b) => a.points - b.points, limit),
    biggestBlowouts: top(winners, (a, b) => b.margin - a.margin, limit),
    closestGames: top(winners, (a, b) => a.margin - b.margin, limit),
    highestInLoss: top(
      all.filter((g) => g.margin < 0),
      (a, b) => b.points - a.points,
      limit,
    ),
    lowestInWin: top(
      all.filter((g) => g.margin > 0),
      (a, b) => a.points - b.points,
      limit,
    ),
    highestCombined: top(
      winners.map((g) => ({ ...g, points: round(g.points + g.opponentPoints) })),
      (a, b) => b.points - a.points,
      limit,
    ),
    mostPointsSeason: top(marks, (a, b) => b.value - a.value, limit),
    fewestPointsSeason: top(marks, (a, b) => a.value - b.value, limit),
    bestRecord: top(marks, (a, b) => byPct(b) - byPct(a) || b.value - a.value, limit),
    worstRecord: top(marks, (a, b) => byPct(a) - byPct(b) || a.value - b.value, limit),
  }
}

export interface Streak {
  ownerId: string
  ownerName: string
  kind: 'win' | 'loss'
  length: number
  from: { season: string; week: number }
  to: { season: string; week: number }
  /** Still running as of the latest game. */
  active: boolean
}

/**
 * Longest regular-season winning and losing streaks per owner, carried
 * across seasons (a streak can span the offseason). A tie ends any streak.
 */
export function streaks(history: LeagueHistory): Streak[] {
  const games = new Map<string, { season: string; week: number; margin: number; name: string }[]>()
  for (const season of weeklySeasons(history).slice().reverse()) {
    for (const t of season.teams) {
      if (!t.ownerId) continue
      const list = games.get(t.ownerId) ?? []
      for (const w of t.weekly.slice().sort((a, b) => a.week - b.week)) {
        list.push({
          season: season.season,
          week: w.week,
          margin: w.points - w.opponentPoints,
          name: t.ownerName,
        })
      }
      games.set(t.ownerId, list)
    }
  }
  const out: Streak[] = []
  for (const [ownerId, list] of games) {
    const ownerName = list[list.length - 1]?.name ?? 'Unknown owner'
    for (const kind of ['win', 'loss'] as const) {
      let bestRun: Streak | null = null
      let start = -1
      for (let i = 0; i <= list.length; i++) {
        const g = list[i]
        const hit = g !== undefined && (kind === 'win' ? g.margin > 0 : g.margin < 0)
        if (hit && start < 0) start = i
        if (!hit && start >= 0) {
          const len = i - start
          const first = list[start]
          const last = list[i - 1]
          if (first && last && (!bestRun || len >= bestRun.length)) {
            bestRun = {
              ownerId,
              ownerName,
              kind,
              length: len,
              from: { season: first.season, week: first.week },
              to: { season: last.season, week: last.week },
              active: i === list.length,
            }
          }
          start = -1
        }
      }
      if (bestRun) out.push(bestRun)
    }
  }
  return out.sort((a, b) => b.length - a.length)
}

export interface Drought {
  ownerId: string
  ownerName: string
  titles: number
  lastTitle: string | null
  /** Completed seasons played since the last title (or ever, with none). */
  seasonsSince: number
}

/** Titles and title droughts per owner, over every season including pre-Sleeper ones. */
export function droughts(history: LeagueHistory): Drought[] {
  const rows = new Map<string, Drought>()
  // Oldest first.
  for (const season of history.seasons.slice().reverse()) {
    if (!season.complete) continue
    for (const t of season.teams) {
      if (!t.ownerId) continue
      const row = rows.get(t.ownerId) ?? {
        ownerId: t.ownerId,
        ownerName: t.ownerName,
        titles: 0,
        lastTitle: null,
        seasonsSince: 0,
      }
      row.ownerName = t.ownerName
      if (isChampion(season, t.rosterId)) {
        row.titles++
        row.lastTitle = season.season
        row.seasonsSince = 0
      } else {
        row.seasonsSince++
      }
      rows.set(t.ownerId, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.seasonsSince - a.seasonsSince || a.titles - b.titles)
}
