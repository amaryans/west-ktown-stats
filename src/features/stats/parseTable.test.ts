import {
  guessSubjectColumn,
  guessValueColumn,
  parseNumber,
  parseTable,
  rowsForImport,
} from './parseTable.ts'

const nflCom = [
  'Player\tPass Yds\tYds/Att\tAtt\tCmp',
  'Patrick Mahomes\t4,183\t7.2\t581\t401',
  'Josh Allen\t3,731\t7.3\t508\t307',
  'Jared Goff\t4,629\t8.6\t539\t390',
].join('\n')

test('parses tab-separated NFL.com tables with a header', () => {
  const t = parseTable(nflCom)
  expect(t.separator).toBe('tab')
  expect(t.header).toEqual(['Player', 'Pass Yds', 'Yds/Att', 'Att', 'Cmp'])
  expect(t.rows).toHaveLength(3)
  expect(guessSubjectColumn(t)).toBe(0)
  expect(guessValueColumn(t, 0)).toBe(1)
  const { rows, skipped } = rowsForImport(t, 0, 1)
  expect(rows).toEqual([
    { subject: 'Patrick Mahomes', value: 4183 },
    { subject: 'Josh Allen', value: 3731 },
    { subject: 'Jared Goff', value: 4629 },
  ])
  expect(skipped).toEqual([])
})

test('handles comma and multi-space separated input without a header', () => {
  const csv = parseTable('"Allen, Josh",12\nMahomes,9')
  expect(csv.separator).toBe('comma')
  expect(csv.header).toEqual(['Column 1', 'Column 2'])
  expect(csv.rows).toEqual([
    ['Allen, Josh', '12'],
    ['Mahomes', '9'],
  ])
  const spaced = parseTable('Josh Allen    12\nPatrick Mahomes    9')
  expect(spaced.rows[0]).toEqual(['Josh Allen', '12'])
})

test('parseNumber strips thousands separators, currency and percent', () => {
  expect(parseNumber('4,183')).toBe(4183)
  expect(parseNumber('$12.50')).toBe(12.5)
  expect(parseNumber('45%')).toBe(45)
  expect(parseNumber('-3')).toBe(-3)
  expect(parseNumber('abc')).toBeNull()
})

test('rowsForImport skips blank, non-numeric and duplicate subjects', () => {
  const t = parseTable('Player\tYds\nA\t10\nB\t--\nA\t11\n\t5')
  const { rows, skipped } = rowsForImport(t, 0, 1)
  expect(rows).toEqual([{ subject: 'A', value: 10 }])
  expect(skipped).toEqual(['B', 'A'])
})
