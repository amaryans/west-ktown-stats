/*
 * All-play records, expected wins and luck.
 *
 * All-play: every week each team's score is compared with every other team's,
 * so a 10-team week is worth 9 games. Expected wins are the season's weekly
 * all-play win shares added up: what a team "should" have won against a
 * random schedule. Luck is actual head-to-head wins minus expected wins.
 */
import type { LeagueHistory, SeasonStandings } from '../standings/history.ts'
import { winPct, type RecordLine } from '../standings/standings.ts'
import {
  addResult,
  emptyLine,
  games,
  result,
  round,
  scoresByWeek,
  weeklyMedians,
  weeklySeasons,
  winValue,
} from './common.ts'

export interface LuckLine {
  /** Record against every other team, every week. */
  allPlay: RecordLine
  allPlayPct: number
  /** Real head-to-head record over the same weeks. */
  h2h: RecordLine
  /** Sum of weekly all-play win shares. */
  expectedWins: number
  /** Head-to-head wins, ties counting half. */
  actualWins: number
  /** actualWins - expectedWins: positive means the schedule helped. */
  luck: number
  /** Wins while scoring below that week's median. */
  luckyWins: number
  /** Losses while scoring above that week's median. */
  unluckyLosses: number
  /** Average score of the opponents actually faced. */
  avgPointsAgainst: number | null
  /** Weeks counted. */
  weeks: number
}

export interface SeasonLuck extends LuckLine {
  rosterId: number
}

export interface CareerLuck extends LuckLine {
  ownerId: string
  ownerName: string
  seasons: number
}

interface Accumulator {
  allPlay: RecordLine
  h2h: RecordLine
  expectedWins: number
  luckyWins: number
  unluckyLosses: number
  pointsAgainst: number
  weeks: number
}

function newAcc(): Accumulator {
  return {
    allPlay: emptyLine(),
    h2h: emptyLine(),
    expectedWins: 0,
    luckyWins: 0,
    unluckyLosses: 0,
    pointsAgainst: 0,
    weeks: 0,
  }
}

function finish(acc: Accumulator): LuckLine {
  const actualWins = winValue(acc.h2h)
  return {
    allPlay: acc.allPlay,
    allPlayPct: winPct(acc.allPlay),
    h2h: acc.h2h,
    expectedWins: round(acc.expectedWins),
    actualWins,
    luck: round(actualWins - acc.expectedWins),
    luckyWins: acc.luckyWins,
    unluckyLosses: acc.unluckyLosses,
    avgPointsAgainst: acc.weeks ? round(acc.pointsAgainst / acc.weeks) : null,
    weeks: acc.weeks,
  }
}

function accumulateSeason(
  season: Pick<SeasonStandings, 'teams'>,
  throughWeek: number,
  get: (rosterId: number) => Accumulator | undefined,
): void {
  const byWeek = scoresByWeek(season, throughWeek)
  const medians = weeklyMedians(byWeek)
  for (const [week, scores] of byWeek) {
    const med = medians.get(week) ?? 0
    for (const s of scores) {
      const acc = get(s.rosterId)
      if (!acc) continue
      const weekLine = emptyLine()
      for (const other of scores) {
        if (other.rosterId === s.rosterId) continue
        addResult(weekLine, result(s.points, other.points))
      }
      const opponents = games(weekLine)
      acc.allPlay.wins += weekLine.wins
      acc.allPlay.losses += weekLine.losses
      acc.allPlay.ties += weekLine.ties
      if (opponents > 0) acc.expectedWins += winValue(weekLine) / opponents
      const h2h = result(s.points, s.opponentPoints)
      addResult(acc.h2h, h2h)
      if (h2h === 1 && s.points < med) acc.luckyWins++
      if (h2h === 0 && s.points > med) acc.unluckyLosses++
      acc.pointsAgainst += s.opponentPoints
      acc.weeks++
    }
  }
}

/** All-play and luck for every team in one season, through `throughWeek` if given. */
export function seasonLuck(
  season: Pick<SeasonStandings, 'teams'>,
  throughWeek = Infinity,
): SeasonLuck[] {
  const accs = new Map(season.teams.map((t) => [t.rosterId, newAcc()]))
  accumulateSeason(season, throughWeek, (id) => accs.get(id))
  return season.teams.map((t) => ({
    rosterId: t.rosterId,
    ...finish(accs.get(t.rosterId) ?? newAcc()),
  }))
}

/** All-play and luck summed per owner across every season with weekly results. */
export function careerLuck(history: LeagueHistory): CareerLuck[] {
  const accs = new Map<string, Accumulator>()
  const names = new Map<string, string>()
  const seasonsPlayed = new Map<string, number>()
  // Oldest first so the newest display name wins.
  for (const season of weeklySeasons(history).slice().reverse()) {
    const owners = new Map<number, string>()
    for (const t of season.teams) {
      if (!t.ownerId || t.weekly.length === 0) continue
      owners.set(t.rosterId, t.ownerId)
      names.set(t.ownerId, t.ownerName)
      seasonsPlayed.set(t.ownerId, (seasonsPlayed.get(t.ownerId) ?? 0) + 1)
      if (!accs.has(t.ownerId)) accs.set(t.ownerId, newAcc())
    }
    accumulateSeason(season, Infinity, (rosterId) => {
      const owner = owners.get(rosterId)
      return owner ? accs.get(owner) : undefined
    })
  }
  return [...accs.entries()].map(([ownerId, acc]) => ({
    ownerId,
    ownerName: names.get(ownerId) ?? 'Unknown owner',
    seasons: seasonsPlayed.get(ownerId) ?? 0,
    ...finish(acc),
  }))
}
