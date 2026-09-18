import type { Team } from '../../data/types.ts'
import Button from '../common/Button.tsx'

interface SlotPickerProps {
  team: Team
  totalSlots: number
  takenSlots: ReadonlySet<number>
  /** Tentative choice awaiting confirmation, null until the winner picks one. */
  selectedSlot: number | null
  onSelect: (slot: number) => void
  onConfirm: () => void
}

export default function SlotPicker({
  team,
  totalSlots,
  takenSlots,
  selectedSlot,
  onSelect,
  onConfirm,
}: SlotPickerProps) {
  return (
    <div className="flex w-full max-w-xs flex-col gap-3 rounded-2xl border border-white/15 bg-white/5 p-4">
      <p className="text-center text-sm text-white/70">
        <span className="font-semibold text-white">{team.teamName}</span> — choose your draft slot
      </p>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: totalSlots }, (_, i) => i + 1).map((slot) => {
          const isTaken = takenSlots.has(slot)
          const isSelected = slot === selectedSlot
          return (
            <Button
              key={slot}
              variant={isSelected ? 'primary' : isTaken ? 'ghost' : 'secondary'}
              disabled={isTaken}
              aria-label={`Draft slot ${slot}`}
              aria-pressed={isSelected}
              className="px-0 py-2 text-center tabular-nums"
              onClick={() => onSelect(slot)}
            >
              {slot}
            </Button>
          )
        })}
      </div>
      <Button disabled={selectedSlot === null} onClick={onConfirm}>
        {selectedSlot === null ? 'Pick a slot' : `Lock in slot ${selectedSlot} ✓`}
      </Button>
    </div>
  )
}
