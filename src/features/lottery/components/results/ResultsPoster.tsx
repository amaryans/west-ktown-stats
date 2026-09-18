import { forwardRef } from 'react'
import type { Team } from '../../data/types.ts'
import TeamAvatar from '../common/TeamAvatar.tsx'

export interface PosterEntry {
  team: Team
  /** Final draft slot, 1-based. */
  slot: number
  /** Lottery seed the team entered with (1 = worst record). */
  seed: number
}

interface ResultsPosterProps {
  leagueName: string
  season?: string
  entries: PosterEntry[]
  lotterySeed: number
}

function MovementBadge({ seed, slot }: { seed: number; slot: number }) {
  const movement = seed - slot
  if (movement > 0) {
    return <span className="text-sm font-semibold text-green-400">▲{movement}</span>
  }
  if (movement < 0) {
    return <span className="text-sm font-semibold text-red-400">▼{-movement}</span>
  }
  return <span className="text-sm text-white/40">—</span>
}

/** The shareable draft-order poster; the ref wraps the exact node exported to PNG. */
const ResultsPoster = forwardRef<HTMLDivElement, ResultsPosterProps>(function ResultsPoster(
  { leagueName, season, entries, lotterySeed },
  ref,
) {
  return (
    <div
      ref={ref}
      className="w-full max-w-lg rounded-3xl border border-white/20 bg-gradient-to-b from-navy-light to-navy-dark p-8 text-white"
    >
      <header className="mb-6 text-center">
        <p className="text-sm font-semibold tracking-[0.25em] text-gold uppercase">Draft order</p>
        <h2 className="mt-1 text-3xl font-black">{leagueName}</h2>
        {season && <p className="mt-1 text-white/60">{season} season results</p>}
      </header>

      <ol className="flex flex-col gap-2">
        {entries.map(({ team, slot, seed }) => (
          <li
            key={team.id}
            className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${
              slot === 1 ? 'border border-gold/70 bg-gold/15' : 'bg-white/5'
            }`}
          >
            <span
              className={`w-8 text-2xl font-black tabular-nums ${slot === 1 ? 'text-gold' : 'text-white/70'}`}
            >
              {slot}
            </span>
            <TeamAvatar src={team.avatarUrl} alt="" className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{team.teamName}</p>
              <p className="truncate text-sm text-white/60">
                {team.ownerName} · {team.wins}-{team.losses}
                {team.ties > 0 ? `-${team.ties}` : ''}
              </p>
            </div>
            <MovementBadge seed={seed} slot={slot} />
          </li>
        ))}
      </ol>

      <footer className="mt-6 text-center text-xs text-white/40">
        Lottery seed {lotterySeed} — this result can be replayed and verified
      </footer>
    </div>
  )
})

export default ResultsPoster
