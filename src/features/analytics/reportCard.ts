/*
 * Manager report card: one grade from four skills, each scored 0–100 as a
 * percentile against the rest of the league that season.
 *
 *  - Draft: starter points the draft class produced for the team.
 *  - Waivers: starter points from waiver and free-agent pickups.
 *  - Trades: net starter points from trades (0 if the team didn't trade).
 *  - Lineups: execution % (points scored / best possible).
 *
 * Luck (actual minus expected wins) is shown next to the grade but kept out
 * of it: it's not a skill.
 */
import { mean, round } from './common.ts'

export const SKILLS = ['draft', 'waivers', 'trades', 'lineups'] as const
export type Skill = (typeof SKILLS)[number]

export interface CardInput {
  rosterId: number
  raw: Record<Skill, number | null>
  luck: number | null
}

export interface Card {
  rosterId: number
  raw: Record<Skill, number | null>
  /** 0–100 percentile per skill, null when unknown. */
  scores: Record<Skill, number | null>
  luck: number | null
  luckScore: number | null
  overall: number | null
  grade: string
}

export function grade(score: number | null): string {
  if (score === null) return '—'
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  if (score >= 20) return 'D'
  return 'F'
}

/** Percentile of each value among the known values (ties share the average rank), 0–100. */
export function percentiles(values: readonly (number | null)[]): (number | null)[] {
  const known = values.filter((v): v is number => v !== null)
  if (known.length === 0) return values.map(() => null)
  if (known.length === 1) return values.map((v) => (v === null ? null : 50))
  return values.map((v) => {
    if (v === null) return null
    const below = known.filter((x) => x < v).length
    const equal = known.filter((x) => x === v).length
    return round(((below + (equal - 1) / 2) / (known.length - 1)) * 100, 1)
  })
}

export function seasonCards(inputs: readonly CardInput[]): Card[] {
  const per = Object.fromEntries(
    SKILLS.map((s) => [s, percentiles(inputs.map((i) => i.raw[s]))]),
  ) as Record<Skill, (number | null)[]>
  const luck = percentiles(inputs.map((i) => i.luck))
  return inputs.map((input, i) => {
    const scores = Object.fromEntries(SKILLS.map((s) => [s, per[s][i] ?? null])) as Record<
      Skill,
      number | null
    >
    const known = SKILLS.map((s) => scores[s]).filter((v): v is number => v !== null)
    const overall = known.length ? round(mean(known) ?? 0, 1) : null
    return {
      rosterId: input.rosterId,
      raw: input.raw,
      scores,
      luck: input.luck,
      luckScore: luck[i] ?? null,
      overall,
      grade: grade(overall),
    }
  })
}

export interface CareerCard {
  key: string
  seasons: number
  scores: Record<Skill, number | null>
  luckScore: number | null
  overall: number | null
  grade: string
}

/** Average each manager's season scores (so every season counts the same). */
export function careerCards(rows: readonly { key: string; card: Card }[]): CareerCard[] {
  const byKey = new Map<string, Card[]>()
  for (const r of rows) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r.card])
  return [...byKey].map(([key, cards]) => {
    const avg = (get: (c: Card) => number | null) => {
      const m = mean(cards.map(get).filter((v): v is number => v !== null))
      return m === null ? null : round(m, 1)
    }
    const overall = avg((c) => c.overall)
    return {
      key,
      seasons: cards.length,
      scores: Object.fromEntries(SKILLS.map((s) => [s, avg((c) => c.scores[s])])) as Record<
        Skill,
        number | null
      >,
      luckScore: avg((c) => c.luckScore),
      overall,
      grade: grade(overall),
    }
  })
}
