import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  assembleFromLeagueId,
  SleeperApiError,
  UnsupportedLeagueError,
  withKeeperEdits,
} from './api/index.ts'
import type { AssembledData } from './api/index.ts'
import { computeEligibility } from './engine/index.ts'
import type { TeamId } from './engine/index.ts'
import { BoardsView } from './components/BoardsView.tsx'
import { KeeperReview } from './components/KeeperReview.tsx'
import { toggleSelection, type Selections } from './lib/selection.ts'
import { editsFromEffective } from './lib/share.ts'
import { loadPlayers } from '../../lib/players.ts'
import { sleeper } from '../../lib/sleeper/client.ts'

type Step = 'loading' | 'review' | 'boards'

interface KeeperEdits {
  add: string[]
  remove: string[]
}

interface SavedState {
  edits: KeeperEdits
  selections: Selections
}

const NO_EDITS: KeeperEdits = { add: [], remove: [] }
const storageKey = (leagueId: string) => `wkt.keepers:v1:${leagueId}`

function readSaved(previousLeagueId: string): SavedState | undefined {
  try {
    const raw = localStorage.getItem(storageKey(previousLeagueId))
    return raw === null ? undefined : (JSON.parse(raw) as SavedState)
  } catch {
    return undefined
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof UnsupportedLeagueError) return error.message
  if (error instanceof SleeperApiError) return error.message
  return `Something went wrong: ${String(error)}`
}

export interface SavedKeeperList {
  /** The completed season the keepers were used in. */
  season: number
  playerIds: string[]
  savedBy: string | null
}

export interface KeepersAppProps {
  leagueId: string
  /** League-wide list saved in the database for the previous season, if any. */
  savedLists: SavedKeeperList[]
  canSave: boolean
  onSave: (list: { season: number; sleeperLeagueId: string; playerIds: string[] }) => Promise<void>
  /** Read this exact season (already drafted, maybe still in progress) instead of the last completed one. */
  exact?: boolean
}

/** Keeper eligibility boards for the upcoming draft, built from the league's previous season. */
export default function KeepersApp({
  leagueId,
  savedLists,
  canSave,
  onSave,
  exact = false,
}: KeepersAppProps) {
  const [step, setStep] = useState<Step>('loading')
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState<string>()
  const [data, setData] = useState<AssembledData | null>(null)
  const [edits, setEdits] = useState<KeeperEdits>(NO_EDITS)
  const [selections, setSelections] = useState<Selections>({})
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const savedList = useMemo(
    () =>
      data
        ? (savedLists.find((l) => l.season === Number(data.previousLeague.season)) ?? null)
        : null,
    [data, savedLists],
  )

  const load = useCallback(async () => {
    setStep('loading')
    setError(undefined)
    try {
      setLoadingMessage('Checking the league…')
      await sleeper.getLeague(leagueId) // fail fast on a bad ID before the big download
      setLoadingMessage('Loading the player database (cached for a day)…')
      const playersDump = await loadPlayers().catch(() => undefined)
      setLoadingMessage('Assembling the previous season…')
      const assembled = await assembleFromLeagueId(sleeper, leagueId, { playersDump, exact })
      const saved = readSaved(assembled.previousLeague.id)
      setData(assembled)
      setEdits(saved?.edits ?? NO_EDITS)
      setSelections(saved?.selections ?? {})
      setStep('review')
    } catch (cause) {
      setStep('loading')
      setError(errorMessage(cause))
    }
  }, [leagueId, exact])

  useEffect(() => {
    void load()
  }, [load])

  // The league-wide saved list wins over local state once per loaded dataset;
  // later local edits stick until saved again. Keyed on the data object so a
  // reload (or a second load in dev strict mode) applies it again.
  const appliedFor = useRef<AssembledData | null>(null)
  useEffect(() => {
    if (!data || !savedList || appliedFor.current === data) return
    appliedFor.current = data
    setEdits(editsFromEffective(new Set(savedList.playerIds), new Set(data.autoDetectedKeepers)))
  }, [data, savedList])

  useEffect(() => {
    if (data === null) return
    const payload: SavedState = { edits, selections }
    try {
      localStorage.setItem(storageKey(data.previousLeague.id), JSON.stringify(payload))
    } catch {
      // Persistence is best-effort.
    }
  }, [data, edits, selections])

  const autoKeepers = useMemo(() => new Set(data?.autoDetectedKeepers ?? []), [data])

  const effectiveKeepers = useMemo(() => {
    const set = new Set(autoKeepers)
    for (const playerId of edits.add) set.add(playerId)
    for (const playerId of edits.remove) set.delete(playerId)
    return set
  }, [autoKeepers, edits])

  const isDirty = useMemo(() => {
    if (!savedList) return effectiveKeepers.size > 0
    const saved = new Set(savedList.playerIds)
    return (
      saved.size !== effectiveKeepers.size || [...effectiveKeepers].some((id) => !saved.has(id))
    )
  }, [savedList, effectiveKeepers])

  const toggleKeeper = useCallback(
    (playerId: string) => {
      setEdits((prev) => {
        const currentlyKeeper =
          (autoKeepers.has(playerId) || prev.add.includes(playerId)) &&
          !prev.remove.includes(playerId)
        if (currentlyKeeper) {
          return autoKeepers.has(playerId)
            ? { add: prev.add.filter((id) => id !== playerId), remove: [...prev.remove, playerId] }
            : { ...prev, add: prev.add.filter((id) => id !== playerId) }
        }
        return autoKeepers.has(playerId)
          ? { ...prev, remove: prev.remove.filter((id) => id !== playerId) }
          : { ...prev, add: [...prev.add, playerId] }
      })
    },
    [autoKeepers],
  )

  const result = useMemo(() => {
    if (data === null) return null
    return computeEligibility(withKeeperEdits(data.engineInput, edits))
  }, [data, edits])

  const onToggleSelection = useCallback((teamId: TeamId, playerId: string) => {
    setSelections((prev) => toggleSelection(prev, teamId, playerId))
  }, [])

  async function save() {
    if (!data) return
    setSaving(true)
    setSaveMessage(null)
    try {
      await onSave({
        season: Number(data.previousLeague.season),
        sleeperLeagueId: data.previousLeague.id,
        playerIds: [...effectiveKeepers],
      })
      setSaveMessage('Saved. Everyone in the league now sees this keeper list.')
    } catch (cause) {
      setSaveMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  if (step === 'loading') {
    return (
      <div className="card" role="status">
        {error ? (
          <>
            <p className="error" style={{ margin: 0 }}>
              {error}
            </p>
            <button type="button" className="small mt" onClick={() => void load()}>
              Try again
            </button>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {loadingMessage}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="keepers">
      {step === 'review' && data !== null && (
        <KeeperReview
          data={data}
          effectiveKeepers={effectiveKeepers}
          importedCount={savedList ? savedList.playerIds.length : null}
          savedBy={savedList?.savedBy ?? null}
          isDirty={isDirty}
          canSave={canSave}
          saving={saving}
          saveMessage={saveMessage}
          onSave={() => void save()}
          onToggle={toggleKeeper}
          onContinue={() => setStep('boards')}
        />
      )}
      {step === 'boards' && data !== null && result !== null && (
        <BoardsView
          data={data}
          result={result}
          selections={selections}
          onToggle={onToggleSelection}
          onBack={() => setStep('review')}
        />
      )}
    </div>
  )
}
