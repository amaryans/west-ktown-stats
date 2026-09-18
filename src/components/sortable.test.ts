import { sortRows, type SortColumn } from './sortable.tsx'

interface Row {
  name: string
  pts: number | null
}

const rows: Row[] = [
  { name: 'Cara', pts: 10 },
  { name: 'alice', pts: null },
  { name: 'Bob', pts: 30 },
  { name: 'Dan', pts: 30 },
]
const columns: SortColumn<Row>[] = [
  { key: 'name', label: 'Name', get: (r) => r.name },
  { key: 'pts', label: 'Pts', get: (r) => r.pts },
]

test('sorts numbers with nulls last in either direction and keeps ties stable', () => {
  expect(sortRows(rows, columns, { key: 'pts', dir: 'desc' }).map((r) => r.name)).toEqual([
    'Bob',
    'Dan',
    'Cara',
    'alice',
  ])
  expect(sortRows(rows, columns, { key: 'pts', dir: 'asc' }).map((r) => r.name)).toEqual([
    'Cara',
    'Bob',
    'Dan',
    'alice',
  ])
})

test('sorts strings case-insensitively', () => {
  expect(sortRows(rows, columns, { key: 'name', dir: 'asc' }).map((r) => r.name)).toEqual([
    'alice',
    'Bob',
    'Cara',
    'Dan',
  ])
})

test('no sort or unknown column returns the original order', () => {
  expect(sortRows(rows, columns, null)).toEqual(rows)
  expect(sortRows(rows, columns, { key: 'nope', dir: 'asc' })).toEqual(rows)
})
