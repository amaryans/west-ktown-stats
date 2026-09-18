import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { revealedTeamIds, useAppStore } from '../state/store.ts'
import type { Team } from '../data/types.ts'
import Button from '../components/common/Button.tsx'
import DraftBoard, { type BoardSlot } from '../components/event/DraftBoard.tsx'
import StandingsRail from '../components/event/StandingsRail.tsx'
import RevealCard, { type RevealStage } from '../components/event/RevealCard.tsx'
import SlotPicker from '../components/event/SlotPicker.tsx'

const DRUMROLL_MS = 2500
/** The first three picks (the biggest winners) get a longer, more agonizing drumroll. */
const HEADLINE_DRUMROLL_MS = 4200
const HEADLINE_PICKS = 3

export default function EventScreen() {
  const league = useAppStore((state) => state.league)
  const lotteryConfig = useAppStore((state) => state.lotteryConfig)
  const result = useAppStore((state) => state.result)
  const settings = useAppStore((state) => state.settings)
  const revealCursor = useAppStore((state) => state.revealCursor)
  const slotAssignments = useAppStore((state) => state.slotAssignments)
  const revealNext = useAppStore((state) => state.revealNext)
  const assignSlot = useAppStore((state) => state.assignSlot)
  const undoSlotAssignment = useAppStore((state) => state.undoSlotAssignment)
  const finishEvent = useAppStore((state) => state.finishEvent)
  const startOver = useAppStore((state) => state.startOver)

  const [stage, setStage] = useState<RevealStage>(revealCursor > 0 ? 'revealed' : 'idle')
  const [tentativeSlot, setTentativeSlot] = useState<number | null>(null)
  const drumrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const teamsById = useMemo(
    () => new Map((league?.teams ?? []).map((team) => [team.id, team])),
    [league],
  )
  const seededTeams = useMemo(
    () =>
      (lotteryConfig?.teams ?? [])
        .map((entry) => teamsById.get(entry.id))
        .filter((team): team is Team => team !== undefined),
    [lotteryConfig, teamsById],
  )

  const totalPicks = result?.pickOrder.length ?? 0
  const revealedIds = useMemo(
    () => revealedTeamIds({ result, revealCursor }),
    [result, revealCursor],
  )
  const revealedIdSet = useMemo(() => new Set(revealedIds), [revealedIds])
  const lastRevealedTeam =
    revealedIds.length > 0
      ? (teamsById.get(revealedIds[revealedIds.length - 1] as string) ?? null)
      : null
  /** Pick number on the card: the pick just revealed, or the one about to be drawn. */
  const currentPickNumber = stage === 'revealed' ? revealCursor : revealCursor + 1
  const candidates = seededTeams.filter((team) => !revealedIdSet.has(team.id))

  const isChooseMode = settings.slotMode === 'winnerChoosesSlot'
  const takenSlots = useMemo(
    () => new Set(slotAssignments.map((assignment) => assignment.slot)),
    [slotAssignments],
  )
  const assignedTeamIds = useMemo(
    () => new Set(slotAssignments.map((assignment) => assignment.teamId)),
    [slotAssignments],
  )
  /** Earliest revealed winner still owed a slot — keeps undo recoverable at any depth. */
  const pendingSlotTeam = isChooseMode
    ? (revealedIds
        .filter((id) => !assignedTeamIds.has(id))
        .map((id) => teamsById.get(id))
        .find((team): team is Team => team !== undefined) ?? null)
    : null
  const needsSlotChoice = pendingSlotTeam !== null && stage !== 'drumroll'

  const allRevealed = revealCursor === totalPicks && totalPicks > 0
  const isEventComplete = allRevealed && (!isChooseMode || slotAssignments.length === totalPicks)
  const canAdvance = stage !== 'drumroll' && !needsSlotChoice && !allRevealed
  const canUndo =
    stage === 'drumroll' || tentativeSlot !== null || (isChooseMode && slotAssignments.length > 0)

  // A new winner on the clock always starts with a clean tentative choice.
  useEffect(() => {
    setTentativeSlot(null)
  }, [pendingSlotTeam?.id])

  const boardSlots: BoardSlot[] = useMemo(() => {
    return Array.from({ length: totalPicks }, (_, i) => {
      const slot = i + 1
      if (isChooseMode) {
        const assignment = slotAssignments.find((entry) => entry.slot === slot)
        return { slot, team: assignment ? (teamsById.get(assignment.teamId) ?? null) : null }
      }
      // Lottery order = draft order: slot k fills once pick k is revealed.
      const teamId = result?.pickOrder[i]
      return { slot, team: revealCursor >= slot && teamId ? (teamsById.get(teamId) ?? null) : null }
    })
  }, [totalPicks, isChooseMode, slotAssignments, revealCursor, result, teamsById])

  const advance = useCallback(() => {
    if (!canAdvance) {
      return
    }
    const upcomingPickNumber = revealCursor + 1
    setStage('drumroll')
    const duration = upcomingPickNumber <= HEADLINE_PICKS ? HEADLINE_DRUMROLL_MS : DRUMROLL_MS
    drumrollTimer.current = setTimeout(() => {
      revealNext()
      setStage('revealed')
      if (upcomingPickNumber === 1) {
        void confetti({ particleCount: 250, spread: 110, origin: { y: 0.6 } })
      }
    }, duration)
  }, [canAdvance, revealCursor, revealNext])

  /**
   * Undo never re-hides a drawn lottery result — it cancels an in-flight
   * drumroll, clears the tentative slot choice, or unlocks the last
   * locked-in slot so the winner can choose again.
   */
  const undo = useCallback(() => {
    if (stage === 'drumroll') {
      if (drumrollTimer.current) {
        clearTimeout(drumrollTimer.current)
      }
      setStage(revealCursor > 0 ? 'revealed' : 'idle')
      return
    }
    if (tentativeSlot !== null) {
      setTentativeSlot(null)
      return
    }
    if (isChooseMode && slotAssignments.length > 0) {
      undoSlotAssignment()
    }
  }, [stage, revealCursor, tentativeSlot, isChooseMode, slotAssignments.length, undoSlotAssignment])

  const confirmSlot = useCallback(() => {
    if (pendingSlotTeam && tentativeSlot !== null) {
      assignSlot(pendingSlotTeam.id, tentativeSlot)
      setTentativeSlot(null)
    }
  }, [pendingSlotTeam, tentativeSlot, assignSlot])

  useEffect(
    () => () => {
      if (drumrollTimer.current) {
        clearTimeout(drumrollTimer.current)
      }
    },
    [],
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space') {
        event.preventDefault()
        advance()
      } else if (event.key.toLowerCase() === 'u') {
        undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [advance, undo])

  if (!league || !result || !lotteryConfig) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-navy text-white">
        <p>No lottery in progress.</p>
        <Button onClick={startOver}>Back to setup</Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col gap-4 bg-navy px-4 py-4 text-white lg:px-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="truncate text-xl font-bold text-white/80 sm:text-2xl">{league.name}</h1>
        <Button
          variant="ghost"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
        >
          ⛶ Fullscreen
        </Button>
      </header>

      <DraftBoard slots={boardSlots} />

      <div className="grid flex-1 gap-6 lg:grid-cols-[280px_1fr_auto]">
        <aside className="hidden lg:block">
          <StandingsRail
            seededTeams={seededTeams}
            oddsBps={lotteryConfig.oddsBps}
            revealedIds={revealedIdSet}
          />
        </aside>

        <section className="flex flex-col items-center justify-center gap-6">
          <RevealCard
            stage={stage}
            candidates={candidates}
            revealedTeam={lastRevealedTeam}
            pickNumber={Math.max(currentPickNumber, 1)}
          />

          <div className="flex items-center gap-3">
            {isEventComplete ? (
              <Button className="px-8 py-3 text-lg" onClick={finishEvent}>
                See the final draft order →
              </Button>
            ) : (
              <>
                <Button className="px-8 py-3 text-lg" disabled={!canAdvance} onClick={advance}>
                  {stage === 'drumroll'
                    ? 'Drawing…'
                    : revealCursor === 0
                      ? 'Reveal the #1 pick'
                      : 'Next pick'}
                </Button>
                <Button variant="ghost" disabled={!canUndo} onClick={undo}>
                  Undo
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-white/40">Space = next · U = undo</p>
        </section>

        <aside className="flex items-center justify-center lg:w-72">
          {needsSlotChoice && pendingSlotTeam && (
            <SlotPicker
              team={pendingSlotTeam}
              totalSlots={totalPicks}
              takenSlots={takenSlots}
              selectedSlot={tentativeSlot}
              onSelect={setTentativeSlot}
              onConfirm={confirmSlot}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
