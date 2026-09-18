import type { ParlayResult, Profile } from '../../../lib/db.ts'
import { formatAmerican } from '../lib/odds.ts'

export function ResultBadge({ result }: { result: ParlayResult }) {
  return <span className={`badge result-${result}`}>{result}</span>
}

export function Odds({ value }: { value: number | null | undefined }) {
  const n = Number(value)
  const cls = value !== null && value !== undefined && n > 0 ? 'odds plus' : 'odds'
  return <span className={cls}>{formatAmerican(value)}</span>
}

export const RESULTS: ParlayResult[] = ['pending', 'won', 'lost', 'push', 'void']

export function ResultSelect({
  value,
  onChange,
  disabled,
  label = 'Result',
}: {
  value: ParlayResult
  onChange: (value: ParlayResult) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ParlayResult)}
    >
      {RESULTS.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  )
}

export function MemberSelect({
  id,
  value,
  onChange,
  profiles,
  placeholder = 'Select a member',
  exclude = [],
  disabled,
}: {
  id?: string
  value: string | null
  onChange: (value: string | null) => void
  profiles: Profile[]
  placeholder?: string
  exclude?: string[]
  disabled?: boolean
}) {
  return (
    <select
      id={id}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{placeholder}</option>
      {profiles
        .filter((p) => !exclude.includes(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name}
            {p.team_name ? ` (${p.team_name})` : ''}
            {p.is_placeholder ? ' · not signed up' : ''}
          </option>
        ))}
    </select>
  )
}
