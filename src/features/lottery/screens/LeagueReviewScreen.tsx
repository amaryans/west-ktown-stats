import { useRef } from 'react'
import { useAppStore } from '../state/store.ts'
import type { Team } from '../data/types.ts'
import Button from '../components/common/Button.tsx'
import TeamAvatar from '../components/common/TeamAvatar.tsx'

/** Read an uploaded image as a data URL so it persists in localStorage. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read the image file'))
    reader.readAsDataURL(file)
  })
}

function parseCount(raw: string): number {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

export default function LeagueReviewScreen() {
  const league = useAppStore((state) => state.league)
  const updateLeagueName = useAppStore((state) => state.updateLeagueName)
  const updateTeam = useAppStore((state) => state.updateTeam)
  const goToPhase = useAppStore((state) => state.goToPhase)
  const startOver = useAppStore((state) => state.startOver)

  if (!league) {
    // Shouldn't happen (phase machine sets a league before review), but recover gracefully.
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-navy text-white">
        <p>No league loaded yet.</p>
        <Button onClick={startOver}>Back to setup</Button>
      </div>
    )
  }

  const isManual = league.source === 'manual'

  return (
    <div className="flex min-h-[60vh] flex-col items-center gap-8 bg-navy px-4 py-10 text-white">
      <header className="flex w-full max-w-5xl flex-col gap-2">
        <h1 className="text-3xl font-bold">Review your league</h1>
        <p className="text-white/60">
          {isManual
            ? 'Fill in your owners and last season’s records — the records set the lottery odds.'
            : 'Imported from Sleeper — correct anything that looks off before the lottery.'}
        </p>
        <label className="mt-2 flex max-w-md flex-col gap-1 text-sm text-white/80">
          League name
          <input
            className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-white focus:border-white/60 focus:outline-none"
            value={league.name}
            onChange={(event) => updateLeagueName(event.target.value)}
          />
        </label>
      </header>

      <div className="w-full max-w-5xl overflow-x-auto rounded-2xl border border-white/15 bg-white/5">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-white/15 text-white/60">
            <tr>
              <th className="px-4 py-3 font-medium">Team</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-3 py-3 text-center font-medium">W</th>
              <th className="px-3 py-3 text-center font-medium">L</th>
              <th className="px-3 py-3 text-center font-medium">T</th>
              <th className="px-4 py-3 text-right font-medium">Points for</th>
            </tr>
          </thead>
          <tbody>
            {league.teams.map((team) => (
              <TeamRow key={team.id} team={team} isManual={isManual} onUpdate={updateTeam} />
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex w-full max-w-5xl flex-wrap justify-between gap-3">
        <Button variant="ghost" onClick={startOver}>
          ← Start over
        </Button>
        <Button onClick={() => goToPhase('config')}>Continue to lottery settings →</Button>
      </footer>
    </div>
  )
}

interface TeamRowProps {
  team: Team
  isManual: boolean
  onUpdate: (teamId: string, patch: Partial<Omit<Team, 'id'>>) => void
}

function TeamRow({ team, isManual, onUpdate }: TeamRowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const cellInput =
    'w-full rounded border border-transparent bg-transparent px-2 py-1.5 text-white hover:border-white/20 focus:border-white/50 focus:bg-white/10 focus:outline-none'
  const countInput = `${cellInput} w-14 text-center`

  async function handleAvatarUpload(file: File | undefined) {
    if (!file) {
      return
    }
    try {
      onUpdate(team.id, { avatarUrl: await readFileAsDataUrl(file) })
    } catch {
      // Leave the existing avatar in place if the file can't be read.
    }
  }

  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="px-4 py-2">
        <div className="flex items-center gap-3">
          {isManual ? (
            <>
              <button
                type="button"
                title="Upload team photo"
                aria-label={`Upload photo for ${team.teamName}`}
                className="cursor-pointer rounded-full ring-white/40 hover:ring-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <TeamAvatar src={team.avatarUrl} alt="" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleAvatarUpload(event.target.files?.[0])}
              />
            </>
          ) : (
            <TeamAvatar src={team.avatarUrl} alt="" />
          )}
          <input
            aria-label={`Team name for ${team.ownerName}`}
            className={cellInput}
            value={team.teamName}
            onChange={(event) => onUpdate(team.id, { teamName: event.target.value })}
          />
        </div>
      </td>
      <td className="px-4 py-2">
        <input
          aria-label={`Owner name for ${team.teamName}`}
          className={cellInput}
          value={team.ownerName}
          onChange={(event) => onUpdate(team.id, { ownerName: event.target.value })}
        />
      </td>
      <td className="px-1 py-2 text-center">
        <input
          aria-label={`Wins for ${team.teamName}`}
          className={countInput}
          inputMode="numeric"
          value={team.wins}
          onChange={(event) => onUpdate(team.id, { wins: parseCount(event.target.value) })}
        />
      </td>
      <td className="px-1 py-2 text-center">
        <input
          aria-label={`Losses for ${team.teamName}`}
          className={countInput}
          inputMode="numeric"
          value={team.losses}
          onChange={(event) => onUpdate(team.id, { losses: parseCount(event.target.value) })}
        />
      </td>
      <td className="px-1 py-2 text-center">
        <input
          aria-label={`Ties for ${team.teamName}`}
          className={countInput}
          inputMode="numeric"
          value={team.ties}
          onChange={(event) => onUpdate(team.id, { ties: parseCount(event.target.value) })}
        />
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-white/70">
        {team.pointsFor.toFixed(1)}
      </td>
    </tr>
  )
}
