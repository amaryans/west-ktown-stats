import { describe, expect, it } from 'vitest'
import { defaultLockAt } from './week.ts'

describe('defaultLockAt', () => {
  it('locks Sunday 12:45pm Eastern during daylight time', () => {
    // 2026 season opens Thursday Sept 10; Week 1 Sunday is Sept 13 (EDT).
    expect(defaultLockAt('2026-09-10', 1).toISOString()).toBe('2026-09-13T16:45:00.000Z')
  })

  it('locks Sunday 12:45pm Eastern after the switch to standard time', () => {
    // Week 9 Sunday is Nov 8, after DST ends on Nov 1.
    expect(defaultLockAt('2026-09-10', 9).toISOString()).toBe('2026-11-08T17:45:00.000Z')
  })
})
