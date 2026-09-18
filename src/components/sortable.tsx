import { useMemo, useState, type ReactNode } from 'react'

export type SortDir = 'asc' | 'desc'
export type SortValue = number | string | null | undefined

export interface SortColumn<T> {
  key: string
  label: ReactNode
  /** Value to sort by; numbers sort numerically, strings alphabetically, null last. */
  get: (row: T) => SortValue
  /** Direction used the first time the column is clicked (numbers default to desc). */
  defaultDir?: SortDir
  /** Extra class for the <th>, e.g. "num". */
  className?: string
  /** Plain-text label for the mobile sort picker when `label` is not a string. */
  title?: string
}

export interface SortState {
  key: string
  dir: SortDir
}

function compareValues(a: SortValue, b: SortValue): number {
  const aNull = a === null || a === undefined || a === ''
  const bNull = b === null || b === undefined || b === ''
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/** Stable sort of `rows` by the column named in `sort`; nulls always sink to the bottom. */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly SortColumn<T>[],
  sort: SortState | null,
): T[] {
  if (!sort) return [...rows]
  const column = columns.find((c) => c.key === sort.key)
  if (!column) return [...rows]
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: column.get(row) }))
    .sort((a, b) => {
      const aNull = a.value === null || a.value === undefined || a.value === ''
      const bNull = b.value === null || b.value === undefined || b.value === ''
      if (aNull !== bNull) return aNull ? 1 : -1
      return compareValues(a.value, b.value) * sign || a.index - b.index
    })
    .map((entry) => entry.row)
}

function initialDir<T>(column: SortColumn<T> | undefined, sample: T | undefined): SortDir {
  if (column?.defaultDir) return column.defaultDir
  if (column && sample !== undefined && typeof column.get(sample) === 'number') return 'desc'
  return 'asc'
}

/** Sort state + sorted rows for a table. Clicking the active column flips direction. */
export function useSortable<T>(
  rows: readonly T[],
  columns: readonly SortColumn<T>[],
  initial: SortState | null = null,
) {
  const [sort, setSort] = useState<SortState | null>(initial)
  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort])
  function toggle(key: string) {
    setSort((current) => {
      if (current?.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      return {
        key,
        dir: initialDir(
          columns.find((c) => c.key === key),
          rows[0],
        ),
      }
    })
  }
  return { sort, setSort, toggle, sorted }
}

/** A <th> that sorts its column; shows the active direction and exposes aria-sort. */
export function SortableTh<T>({
  column,
  sort,
  onToggle,
  scope = 'col',
}: {
  column: SortColumn<T>
  sort: SortState | null
  onToggle: (key: string) => void
  scope?: 'col' | 'row'
}) {
  const active = sort?.key === column.key
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th
      scope={scope}
      className={['sortable', column.className, active ? 'active' : ''].filter(Boolean).join(' ')}
      aria-sort={ariaSort}
    >
      <button type="button" className="sort-button" onClick={() => onToggle(column.key)}>
        <span>{column.label}</span>
        <span className="sort-arrow" aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

/** Sort picker for layouts where the table header is hidden (phone card lists). */
export function SortSelect<T>({
  columns,
  sort,
  onChange,
  label = 'Sort by',
  className = 'sort-select',
}: {
  columns: readonly SortColumn<T>[]
  sort: SortState | null
  onChange: (sort: SortState | null) => void
  label?: string
  className?: string
}) {
  const value = sort ? `${sort.key}:${sort.dir}` : ''
  return (
    <label className={className}>
      <span className="small muted">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => {
          const [key, dir] = e.target.value.split(':')
          onChange(key && dir ? { key, dir: dir as SortDir } : null)
        }}
      >
        <option value="">Default</option>
        {columns.map((c) => {
          const name = c.title ?? (typeof c.label === 'string' ? c.label : c.key)
          return [
            <option key={`${c.key}:desc`} value={`${c.key}:desc`}>
              {name} ↓
            </option>,
            <option key={`${c.key}:asc`} value={`${c.key}:asc`}>
              {name} ↑
            </option>,
          ]
        })}
      </select>
    </label>
  )
}
