// NFL week helpers. Weeks run Tuesday -> Monday; `seasonStart` is the date
// of the Week 1 Thursday game ("YYYY-MM-DD").
import type { Week } from '../../../lib/db.ts'

const DAY_MS = 86_400_000
export const MAX_WEEK = 22

function parseLocalDate(ymd: string): Date {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function weekStartDate(seasonStart: string, week: number): Date {
  const tuesday = parseLocalDate(seasonStart)
  tuesday.setDate(tuesday.getDate() - 2 + (week - 1) * 7)
  return tuesday
}

export function nflWeekFor(date: Date, seasonStart: string | null | undefined): number {
  if (!seasonStart) return 1
  const start = weekStartDate(seasonStart, 1)
  const diff = (date.getTime() - start.getTime()) / DAY_MS
  const week = Math.floor(diff / 7) + 1
  return Math.min(MAX_WEEK, Math.max(1, week))
}

export function currentNflWeek(seasonStart: string | null | undefined): number {
  return nflWeekFor(new Date(), seasonStart)
}

/** Default lock time for a week: Thursday 8:15pm local time (TNF kickoff). */
export function defaultLockAt(seasonStart: string, week: number): Date {
  const thursday = weekStartDate(seasonStart, week)
  thursday.setDate(thursday.getDate() + 2)
  thursday.setHours(20, 15, 0, 0)
  return thursday
}

export function weekLabel(week: number): string {
  if (week <= 18) return `Week ${week}`
  const names: Record<number, string> = {
    19: 'Wild Card',
    20: 'Divisional',
    21: 'Conf. Champ',
    22: 'Super Bowl',
  }
  return names[week] ?? `Week ${week}`
}

export function isLocked(week: Pick<Week, 'lock_at'> | null | undefined): boolean {
  return Boolean(week?.lock_at) && new Date(week?.lock_at ?? 0).getTime() <= Date.now()
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** <input type="datetime-local"> wants "YYYY-MM-DDTHH:MM" in local time. */
export function toLocalInputValue(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
