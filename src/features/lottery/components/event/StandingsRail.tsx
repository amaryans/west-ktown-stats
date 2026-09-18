import type { Team } from '../../data/types.ts'
import TeamAvatar from '../common/TeamAvatar.tsx'

interface StandingsRailProps {
  /** Teams in seed order (worst first), parallel to oddsBps. */
  seededTeams: Team[]
  oddsBps: number[]
  revealedIds: ReadonlySet<string>
}

export default function StandingsRail({ seededTeams, oddsBps, revealedIds }: StandingsRailProps) {
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Lottery seeds">
      {seededTeams.map((team, index) => {
        const isRevealed = revealedIds.has(team.id)
        return (
          <li
            key={team.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-opacity ${
              isRevealed ? 'opacity-30' : 'bg-white/5'
            }`}
          >
            <span className="w-5 text-right text-xs tabular-nums text-white/50">{index + 1}</span>
            <TeamAvatar src={team.avatarUrl} alt="" className="size-7" />
            <span className="flex-1 truncate text-sm font-medium">{team.teamName}</span>
            <span className="text-xs tabular-nums text-white/50">
              {((oddsBps[index] ?? 0) / 100).toFixed(1)}%
            </span>
          </li>
        )
      })}
    </ol>
  )
}
