import { motion } from 'framer-motion'
import type { Team } from '../../data/types.ts'
import TeamAvatar from '../common/TeamAvatar.tsx'

export interface BoardSlot {
  slot: number
  team: Team | null
}

interface DraftBoardProps {
  slots: BoardSlot[]
}

export default function DraftBoard({ slots }: DraftBoardProps) {
  return (
    <ol className="flex w-full gap-2 overflow-x-auto pb-1" aria-label="Draft order board">
      {slots.map(({ slot, team }) => (
        <li
          key={slot}
          className={`flex min-w-16 flex-1 flex-col items-center gap-1 rounded-xl border p-2 text-center ${
            team ? 'border-gold/60 bg-white/10' : 'border-white/15 bg-white/5'
          }`}
        >
          <span className={`text-xs font-bold ${slot === 1 ? 'text-gold' : 'text-white/50'}`}>
            {slot === 1 ? '🏆 1' : slot}
          </span>
          {team ? (
            <motion.div
              layoutId={`board-team-${team.id}`}
              className="flex flex-col items-center gap-1"
            >
              <TeamAvatar src={team.avatarUrl} alt="" className="size-8 sm:size-10" />
              <span className="max-w-20 truncate text-xs font-medium">{team.teamName}</span>
            </motion.div>
          ) : (
            <span className="flex size-8 items-center justify-center text-white/20 sm:size-10">
              ?
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}
