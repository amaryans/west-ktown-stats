import { describe, expect, it } from 'vitest'
import {
  playBracket,
  playReseededBracket,
  roundCount,
  roundWeeks,
  seedingOrder,
  standardBracket,
  winnersPath,
} from './bracket.ts'

describe('standardBracket', () => {
  it('orders seeds the way Sleeper does', () => {
    expect(seedingOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    expect(roundCount(6)).toBe(3)
    expect(roundCount(4)).toBe(2)
    expect(roundCount(1)).toBe(0)
  })

  it('gives a six-team bracket byes to the top two seeds', () => {
    const b = standardBracket(6)
    expect(b.filter((m) => m.r === 1).map((m) => [m.t1, m.t2])).toEqual([
      [1, null],
      [4, 5],
      [2, null],
      [3, 6],
    ])
    expect(b.filter((m) => m.r === 2).map((m) => [m.t1_from?.w, m.t2_from?.w])).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(b.find((m) => m.p === 1)?.r).toBe(3)
  })
})

describe('playBracket', () => {
  it('advances byes, plays each round and finds the champion', () => {
    const scores: Record<number, number> = { 1: 100, 2: 90, 3: 120, 4: 80, 5: 85, 6: 70 }
    const out = playBracket(
      standardBracket(6),
      (s) => s,
      (s) => scores[s] ?? 0,
    )
    // 5 beats 4, 3 beats 6; 1 beats 5, 3 beats 2; 3 beats 1.
    expect(out.champion).toBe(3)
    expect(out.rounds).toBe(3)
    expect(out.reached.get(1)).toBe(3)
    expect(out.reached.get(2)).toBe(2)
    expect(out.reached.get(5)).toBe(2)
    expect(out.reached.get(4)).toBe(1)
  })

  it('keeps results Sleeper has already recorded and gives ties to the better seed', () => {
    const bracket = standardBracket(4).map((m) => (m.m === 1 ? { ...m, w: 4, l: 1 } : m))
    const out = playBracket(
      bracket,
      (s) => s,
      () => 50,
    )
    // Seed 4 upset seed 1 for real; the rest ties, so seed 2 beats 3 and then 4.
    expect(out.champion).toBe(2)
    expect(out.reached.get(4)).toBe(2)
  })
})

describe('winnersPath', () => {
  it('drops placement games fed by losers', () => {
    const b = standardBracket(4)
    const third = {
      r: 2,
      m: 99,
      t1: null,
      t2: null,
      t1_from: { l: 1 },
      t2_from: { l: 2 },
      w: null,
      l: null,
      p: 3,
    }
    const fifth = {
      r: 3,
      m: 100,
      t1: null,
      t2: null,
      t1_from: { w: 99 },
      t2_from: null,
      w: null,
      l: null,
      p: 5,
    }
    expect(winnersPath([...b, third, fifth]).map((m) => m.m)).toEqual(b.map((m) => m.m))
  })
})

describe('playReseededBracket', () => {
  it('pairs the best remaining seed with the worst each round', () => {
    const seeds = [11, 12, 13, 14, 15, 16] // roster ids, seed 1 first
    const score = (t: number) => (t === 16 ? 200 : 100 - t)
    const out = playReseededBracket(seeds, score)
    // Round 1: 13 v 16 (16 wins), 14 v 15 (14 wins). Round 2: 11 v 16, 12 v 14 → 16 and 12. Final: 16.
    expect(out.champion).toBe(16)
    expect(out.reached.get(12)).toBe(3)
    expect(out.reached.get(15)).toBe(1)
    expect(out.reached.get(11)).toBe(2)
  })
})

describe('roundWeeks', () => {
  it('lays rounds onto weeks by Sleeper round type', () => {
    expect(roundWeeks(6, 15, 0)).toEqual([[15], [16], [17]])
    expect(roundWeeks(6, 15, 1)).toEqual([[15], [16], [17, 18]])
    expect(roundWeeks(4, 15, 2)).toEqual([
      [15, 16],
      [17, 18],
    ])
    expect(roundWeeks(6, 16, 2)).toEqual([[16, 17], [18], []])
  })
})
