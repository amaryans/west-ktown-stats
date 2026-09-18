import { describe, expect, it } from 'vitest'
import { decodeKeepers, editsFromEffective, encodeKeepers } from '../lib/share'

describe('share links', () => {
  it('round-trips keeper ids through the URL parameter', () => {
    const ids = ['4046', '9509', 'PHI']
    expect(decodeKeepers(encodeKeepers(ids))).toEqual(ids)
  })

  it('dedupes and ignores empty segments when decoding', () => {
    expect(decodeKeepers('4046,,4046, 9509 ,')).toEqual(['4046', '9509'])
  })

  it('decodes an empty parameter to no keepers', () => {
    expect(decodeKeepers('')).toEqual([])
  })

  it('derives edits so any recipient reaches the shared effective set', () => {
    const auto = new Set(['a', 'b'])
    const effective = new Set(['b', 'c'])
    expect(editsFromEffective(effective, auto)).toEqual({ add: ['c'], remove: ['a'] })
  })

  it('derives empty edits when the shared set matches auto-detection', () => {
    const auto = new Set(['a', 'b'])
    expect(editsFromEffective(auto, auto)).toEqual({ add: [], remove: [] })
  })
})
