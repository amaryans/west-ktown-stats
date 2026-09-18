import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Team } from '../../data/types.ts'
import TeamAvatar from '../common/TeamAvatar.tsx'

export type RevealStage = 'idle' | 'drumroll' | 'revealed'

interface RevealCardProps {
  stage: RevealStage
  /** Teams still in the hopper, cycled during the drumroll. */
  candidates: Team[]
  revealedTeam: Team | null
  /** The pick number being revealed (1 = first overall). */
  pickNumber: number
}

const CYCLE_START_MS = 90
const CYCLE_SLOWDOWN = 1.12

/** Cycles through candidate avatars fast-then-slow while the drumroll runs. */
function useCyclingIndex(isActive: boolean, count: number): number {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!isActive || count === 0) {
      return
    }
    let delay = CYCLE_START_MS
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setIndex((prev) => (prev + 1) % count)
      delay *= CYCLE_SLOWDOWN
      timer = setTimeout(tick, delay)
    }
    timer = setTimeout(tick, delay)
    return () => clearTimeout(timer)
  }, [isActive, count])
  return index
}

export default function RevealCard({
  stage,
  candidates,
  revealedTeam,
  pickNumber,
}: RevealCardProps) {
  const cycleIndex = useCyclingIndex(stage === 'drumroll', candidates.length)
  const cyclingTeam = candidates[cycleIndex % Math.max(candidates.length, 1)]
  const isFirstOverall = pickNumber === 1

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <p className="text-lg font-semibold tracking-widest text-white/60 uppercase">
        {stage === 'revealed' ? `Pick ${pickNumber}` : `Up next: pick ${pickNumber}`}
      </p>

      <div className="relative aspect-[4/5] w-full" style={{ perspective: 1200 }}>
        <AnimatePresence initial={false}>
          {stage === 'idle' && (
            <motion.div
              key="idle"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-white/15 bg-white/5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="text-6xl">🏈</span>
              <span className="text-white/50">Ready when you are</span>
            </motion.div>
          )}

          {stage === 'drumroll' && (
            <motion.div
              key="drumroll"
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/25 bg-navy-light"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: [1, 1.02, 1] }}
              exit={{ opacity: 0 }}
              transition={{ scale: { repeat: Infinity, duration: 0.5 } }}
            >
              {cyclingTeam && (
                <TeamAvatar src={cyclingTeam.avatarUrl} alt="" className="size-28 sm:size-36" />
              )}
              <span className="text-xl font-bold text-white/80">{cyclingTeam?.teamName}</span>
              <span className="animate-pulse text-sm tracking-widest text-white/50 uppercase">
                Drawing…
              </span>
            </motion.div>
          )}

          {stage === 'revealed' && revealedTeam && (
            <motion.div
              key={`revealed-${revealedTeam.id}`}
              data-testid="revealed-card"
              className={`absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-3xl border-2 p-6 ${
                isFirstOverall
                  ? 'border-gold bg-gradient-to-b from-gold/25 to-navy-light shadow-[0_0_60px_rgba(212,175,55,0.35)]'
                  : 'border-white/40 bg-navy-light'
              }`}
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 120, damping: 14 }}
            >
              {isFirstOverall && <span className="text-2xl font-black text-gold">#1 OVERALL</span>}
              <TeamAvatar src={revealedTeam.avatarUrl} alt="" className="size-32 sm:size-44" />
              <div className="text-center">
                <p className="text-3xl font-black sm:text-4xl">{revealedTeam.teamName}</p>
                <p className="mt-1 text-lg text-white/70">{revealedTeam.ownerName}</p>
                <p className="mt-1 text-sm tabular-nums text-white/50">
                  {revealedTeam.wins}-{revealedTeam.losses}
                  {revealedTeam.ties > 0 ? `-${revealedTeam.ties}` : ''} last season
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
