import { describe, expect, it } from 'vitest'
import { scoreStatLine } from './scoring.ts'

describe('scoreStatLine', () => {
  const scoring = { pass_yd: 0.04, pass_td: 4, rec: 0.5, rec_yd: 0.1, fum_lost: -2, bonus_x: 0 }

  it('applies league weights to the projected stats', () => {
    expect(scoreStatLine({ pass_yd: 250, pass_td: 2, rec: 4, rec_yd: 40 }, scoring)).toBeCloseTo(
      10 + 8 + 2 + 4,
    )
  })

  it('ignores stats the league does not score', () => {
    expect(scoreStatLine({ rush_yd: 100, rec: 2 }, scoring)).toBeCloseTo(1)
  })

  it('falls back to Sleeper totals when nothing matched', () => {
    expect(scoreStatLine({ pts_half_ppr: 9.5, pts_ppr: 11 }, scoring)).toBe(9.5)
    expect(scoreStatLine({ pts_half_ppr: 9.5, pts_ppr: 11 }, { rec: 1 })).toBe(11)
    expect(scoreStatLine({ pts_std: 8 }, null)).toBe(8)
    expect(scoreStatLine({}, null)).toBe(0)
  })
})
