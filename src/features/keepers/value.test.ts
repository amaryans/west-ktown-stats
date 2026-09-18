import { keeperValueRows, normalizeName, pickForRound, resolveAdp } from './value.ts'
import type { KeeperClaim } from './engine/index.ts'

test('normalizeName strips punctuation and suffixes', () => {
  expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase')
  expect(normalizeName('Odell Beckham Jr.')).toBe('odell beckham')
  expect(normalizeName('  Amon-Ra  St. Brown ')).toBe('amonra st brown')
})

test('pickForRound follows a snake draft and defaults to mid-round', () => {
  expect(pickForRound(1, 12, 3)).toBe(3)
  expect(pickForRound(2, 12, 3)).toBe(22)
  expect(pickForRound(5, 12, 12)).toBe(60)
  expect(pickForRound(6, 12, 12)).toBe(61)
  expect(pickForRound(8, 12, null)).toBe(90)
})

test('resolveAdp prefers manual ADP, then Sleeper rank', () => {
  const lookup = {
    manualByName: new Map([['justin jefferson', 4.5]]),
    sleeperRankById: new Map([
      ['6794', 3],
      ['4046', 12],
      ['9999', 9999999],
    ]),
  }
  expect(resolveAdp('6794', 'Justin Jefferson', lookup)).toEqual({ adp: 4.5, source: 'manual' })
  expect(resolveAdp('4046', 'Patrick Mahomes', lookup)).toEqual({ adp: 12, source: 'sleeper-rank' })
  expect(resolveAdp('9999', 'Nobody', lookup)).toEqual({ adp: null, source: 'none' })
})

test('keeperValueRows ranks claims by picks of value', () => {
  const claims: KeeperClaim[] = [
    { playerId: 'a', teamId: 1, cost: { kind: 'draft-position', round: 8 }, rule: '3.1.1' },
    { playerId: 'b', teamId: 1, cost: { kind: 'default' }, rule: '3.1.2' },
    { playerId: 'c', teamId: 1, cost: { kind: 'draft-position', round: 6 }, rule: '3.1.1' },
  ]
  const info = {
    a: { name: 'Late Round Gem', position: 'WR' },
    b: { name: 'Waiver Hero', position: 'RB' },
    c: { name: 'Bust', position: 'TE' },
  }
  const rows = keeperValueRows(claims, info, 12, 3, {
    manualByName: new Map([['late round gem', 20]]),
    sleeperRankById: new Map([['b', 50]]),
  })
  expect(rows.map((r) => r.playerId)).toEqual(['a', 'b', 'c'])
  expect(rows[0]).toMatchObject({
    keepRound: 8,
    keepPick: 94,
    adp: 20,
    valuePicks: 74,
    valueRounds: 6.2,
    adpSource: 'manual',
  })
  expect(rows[1]).toMatchObject({
    keepRound: 5,
    keepPick: 51,
    adp: 50,
    valuePicks: 1,
    adpSource: 'sleeper-rank',
  })
  expect(rows[2]).toMatchObject({ adp: null, valuePicks: null, adpSource: 'none' })
})
