/**
 * Playoff bracket: Sleeper's standard bracket (seed 1 meets the worst
 * surviving seed of its half, no reseeding) or a reseeded one where every
 * round pairs the best remaining seed with the worst. A match's teams are
 * either fixed (`t1`/`t2`) or the winner/loser of an earlier match
 * (`t1_from`/`t2_from`), which is exactly the shape Sleeper's
 * `winners_bracket` endpoint uses, so a bracket in progress can be replayed
 * with its finished games fixed.
 */
/** First-round byes for a bracket of `playoffTeams`: the gap up to the next power of two. */
export function byeCount(playoffTeams: number): number {
  if (playoffTeams <= 1) return 0
  let size = 1
  while (size < playoffTeams) size *= 2
  return size - playoffTeams
}

export interface BracketMatch {
  /** Round, 1-based. */
  r: number
  /** Match id, unique within the bracket. */
  m: number
  t1: number | null
  t2: number | null
  t1_from?: { w?: number | null; l?: number | null } | null
  t2_from?: { w?: number | null; l?: number | null } | null
  /** Winner / loser when the game has been played. */
  w: number | null
  l: number | null
  /** Placement game: winner takes place p. The final has p = 1. */
  p?: number | null
}

/** Standard tournament seeding order for a bracket of `size` (a power of two). */
export function seedingOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const next = order.length * 2 + 1
    order = order.flatMap((s) => [s, next - s])
  }
  return order
}

/** Total playoff rounds for a bracket of `playoffTeams`. */
export function roundCount(playoffTeams: number): number {
  if (playoffTeams <= 1) return 0
  let rounds = 0
  let size = 1
  while (size < playoffTeams) {
    size *= 2
    rounds++
  }
  return rounds
}

/**
 * The winners' path of a standard bracket, with seed numbers (1-based) in
 * `t1`/`t2`. Byes appear as round-one matches with a single team.
 */
export function standardBracket(playoffTeams: number): BracketMatch[] {
  const rounds = roundCount(playoffTeams)
  if (rounds === 0) return []
  const size = 2 ** rounds
  const order = seedingOrder(size)
  const matches: BracketMatch[] = []
  let m = 1
  let previous: number[] = []
  for (let i = 0; i < size; i += 2) {
    const a = order[i] as number
    const b = order[i + 1] as number
    matches.push({
      r: 1,
      m,
      t1: a <= playoffTeams ? a : null,
      t2: b <= playoffTeams ? b : null,
      w: null,
      l: null,
      p: rounds === 1 ? 1 : null,
    })
    previous.push(m++)
  }
  for (let r = 2; r <= rounds; r++) {
    const current: number[] = []
    for (let i = 0; i < previous.length; i += 2) {
      matches.push({
        r,
        m,
        t1: null,
        t2: null,
        t1_from: { w: previous[i] },
        t2_from: { w: previous[i + 1] },
        w: null,
        l: null,
        p: r === rounds ? 1 : null,
      })
      current.push(m++)
    }
    previous = current
  }
  return matches
}

/**
 * Only the matches on the way to the title: round-one games and any game fed
 * solely by winners of games already on the path. Sleeper's bracket also
 * carries placement games for the losers, which must not count as playoff rounds.
 */
export function winnersPath<T extends BracketMatch>(matches: readonly T[]): T[] {
  const onPath = new Set<number>()
  const sorted = matches.slice().sort((a, b) => a.r - b.r || a.m - b.m)
  for (const m of sorted) {
    const sources = [m.t1_from, m.t2_from]
    const fedByLosers = sources.some((f) => f?.l != null)
    const fedByOutsiders = sources.some((f) => f?.w != null && !onPath.has(f.w))
    if (!fedByLosers && !fedByOutsiders) onPath.add(m.m)
  }
  return sorted.filter((m) => onPath.has(m.m))
}

export interface BracketOutcome {
  champion: number | null
  /** Deepest round each team played in (or advanced through on a bye), by roster id. */
  reached: Map<number, number>
  rounds: number
}

/**
 * Plays a bracket out. `score(team, round)` supplies the score for a team in
 * a round (summed across the round's weeks by the caller); a tie goes to the
 * better seed. Games Sleeper has already decided keep their result.
 */
export function playBracket(
  matches: readonly BracketMatch[],
  seedOf: (team: number) => number,
  score: (team: number, round: number) => number,
): BracketOutcome {
  const results = new Map<number, { w: number | null; l: number | null }>()
  const reached = new Map<number, number>()
  const rounds = matches.reduce((max, m) => Math.max(max, m.r), 0)
  let champion: number | null = null
  const ordered = matches.slice().sort((a, b) => a.r - b.r || a.m - b.m)
  const resolve = (
    fixed: number | null,
    from: BracketMatch['t1_from'] | undefined,
  ): number | null => {
    if (fixed != null) return fixed
    if (from?.w != null) return results.get(from.w)?.w ?? null
    if (from?.l != null) return results.get(from.l)?.l ?? null
    return null
  }
  for (const match of ordered) {
    const t1 = resolve(match.t1, match.t1_from)
    const t2 = resolve(match.t2, match.t2_from)
    for (const t of [t1, t2]) if (t != null) reached.set(t, Math.max(reached.get(t) ?? 0, match.r))
    let w: number | null = match.w
    let l: number | null = match.l
    if (w == null) {
      if (t1 != null && t2 != null) {
        const s1 = score(t1, match.r)
        const s2 = score(t2, match.r)
        const t1Wins = s1 > s2 || (s1 === s2 && seedOf(t1) <= seedOf(t2))
        w = t1Wins ? t1 : t2
        l = t1Wins ? t2 : t1
      } else {
        w = t1 ?? t2 // bye
        l = null
      }
    }
    results.set(match.m, { w, l })
    if (match.p === 1 || (match.p == null && match.r === rounds)) champion = w
  }
  return { champion, reached, rounds }
}

/**
 * A reseeded bracket: byes to the top seeds, then each round pairs the best
 * remaining seed with the worst. Built one round at a time because the
 * pairings depend on results.
 */
export function playReseededBracket(
  seeds: readonly number[],
  score: (team: number, round: number) => number,
): BracketOutcome {
  const rounds = roundCount(seeds.length)
  const seedOf = new Map(seeds.map((t, i) => [t, i + 1]))
  const reached = new Map<number, number>()
  let alive = seeds.slice()
  for (let r = 1; r <= rounds; r++) {
    const byes = r === 1 ? byeCount(seeds.length) : 0
    const resting = alive.slice(0, byes)
    const playing = alive.slice(byes)
    const winners: number[] = []
    for (const t of alive) reached.set(t, r)
    for (let i = 0; i < playing.length / 2; i++) {
      const a = playing[i] as number
      const b = playing[playing.length - 1 - i] as number
      const sa = score(a, r)
      const sb = score(b, r)
      winners.push(sa > sb || (sa === sb && (seedOf.get(a) ?? 0) <= (seedOf.get(b) ?? 0)) ? a : b)
    }
    alive = [...resting, ...winners].sort((a, b) => (seedOf.get(a) ?? 0) - (seedOf.get(b) ?? 0))
  }
  return { champion: alive[0] ?? null, reached, rounds }
}

/**
 * Which weeks each round is played in. Sleeper's `playoff_round_type`:
 * 0 = one week per round, 1 = a two-week championship, 2 = two weeks per round.
 */
export function roundWeeks(
  playoffTeams: number,
  firstWeek: number,
  roundType: number,
  lastWeek = 18,
): number[][] {
  const rounds = roundCount(playoffTeams)
  const out: number[][] = []
  let week = firstWeek
  for (let r = 1; r <= rounds; r++) {
    const length = roundType === 2 || (roundType === 1 && r === rounds) ? 2 : 1
    const weeks: number[] = []
    for (let i = 0; i < length && week <= lastWeek; i++) weeks.push(week++)
    out.push(weeks)
  }
  return out
}
