import type { CSSProperties, ReactNode } from 'react'
import Avatar from '../../components/Avatar.tsx'
import type { LeagueHistory, SeasonStandings } from '../../features/standings/history.ts'
import { teamAvatarSrc } from '../../features/standings/SeasonTable.tsx'
import type { SeasonTeam } from '../../features/standings/standings.ts'

export const ALL = 'all'

export const fmt1 = (n: number | null | undefined, signed = false) =>
  n === null || n === undefined
    ? '—'
    : `${signed && n > 0 ? '+' : ''}${(Math.round(n * 10) / 10).toFixed(1)}`
export const fmt2 = (n: number | null | undefined, signed = false) =>
  n === null || n === undefined ? '—' : `${signed && n > 0 ? '+' : ''}${n.toFixed(2)}`
export const fmtPct = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)}%`
export const signClass = (n: number | null | undefined) => (!n ? '' : n > 0 ? 'success' : 'error')

/** Pick a season (optionally "All seasons") among those with weekly results. */
export function SeasonPicker({
  seasons,
  value,
  onChange,
  allowAll,
}: {
  seasons: SeasonStandings[]
  value: string
  onChange: (value: string) => void
  allowAll?: boolean
}) {
  return (
    <label className="picker">
      <span className="muted">Season</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Season">
        {allowAll && <option value={ALL}>All seasons</option>}
        {seasons.map((s) => (
          <option key={s.leagueId} value={s.leagueId}>
            {s.season}
            {s.complete ? '' : ' (in progress)'}
          </option>
        ))}
      </select>
    </label>
  )
}

export function TeamCell({
  team,
  sub,
}: {
  team: Pick<SeasonTeam, 'avatar' | 'teamAvatarUrl' | 'teamName' | 'ownerName'>
  sub?: string
}) {
  return (
    <div className="team team--nowrap">
      <Avatar src={teamAvatarSrc(team)} name={team.teamName} />
      <div className="team__names">
        <div className="team__name">{team.teamName}</div>
        <div className="team__owner">{sub ?? team.ownerName}</div>
      </div>
    </div>
  )
}

/** An owner's most recent team, for avatars and names on all-time tables. */
export function latestTeam(history: LeagueHistory, ownerId: string): SeasonTeam | undefined {
  for (const s of history.seasons) {
    const t = s.teams.find((x) => x.ownerId === ownerId)
    if (t) return t
  }
  return undefined
}

/** Background tint from -1 (bad) to 1 (good). */
export function heat(x: number): CSSProperties | undefined {
  if (!Number.isFinite(x) || x === 0) return undefined
  const pct = Math.round(Math.min(1, Math.abs(x)) * 35)
  const color = x > 0 ? 'var(--good)' : 'var(--bad)'
  return { background: `color-mix(in srgb, ${color} ${pct}%, transparent)` }
}

export function Explainer({ children }: { children: ReactNode }) {
  return <p className="muted small mt">{children}</p>
}
