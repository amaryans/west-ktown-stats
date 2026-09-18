import { useMemo, useState } from 'react'
import type { AssembledData } from '../api'
import { playerLabel } from '../lib/format'

export function KeeperReview(props: {
  data: AssembledData
  effectiveKeepers: ReadonlySet<string>
  /** How many keepers came from the league-wide saved list (null = none saved). */
  importedCount?: number | null
  savedBy?: string | null
  /** True when the local list differs from what is saved for the league. */
  isDirty?: boolean
  canSave?: boolean
  saving?: boolean
  saveMessage?: string | null
  onSave?: () => void
  onToggle: (playerId: string) => void
  onContinue: () => void
  onBack?: () => void
}) {
  const { data, effectiveKeepers } = props
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length < 2) return []
    return Object.entries(data.playerInfo)
      .filter(
        ([playerId, info]) =>
          !effectiveKeepers.has(playerId) && info.name.toLowerCase().includes(needle),
      )
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .slice(0, 12)
  }, [data, effectiveKeepers, query])

  const keeperList = useMemo(
    () =>
      [...effectiveKeepers].sort((a, b) =>
        (data.playerInfo[a]?.name ?? a).localeCompare(data.playerInfo[b]?.name ?? b),
      ),
    [data, effectiveKeepers],
  )

  const teamNameOf = (teamId?: number) =>
    teamId === undefined
      ? undefined
      : data.engineInput.teams.find((team) => team.id === teamId)?.name

  const preDetected = useMemo(
    () => data.keeperDetection.filter((detection) => detection.source === 'pre-draft-roster'),
    [data],
  )

  const skippedByTeam = useMemo(() => {
    const grouped = new Map<string, number[]>()
    for (const slot of data.skippedDraftSlots) {
      const name =
        (slot.teamId !== undefined
          ? data.engineInput.teams.find((team) => team.id === slot.teamId)?.name
          : undefined) ?? `Slot ${slot.slot}`
      grouped.set(name, [...(grouped.get(name) ?? []), slot.round])
    }
    return [...grouped.entries()]
  }, [data])

  return (
    <div className="stack">
      <div className="card">
        <p>
          Building <strong>{data.upcomingSeason}</strong> keeper options for{' '}
          <strong>{data.previousLeague.name}</strong> from the {data.previousLeague.season} season —{' '}
          {data.engineInput.teams.length} teams, {data.draft.type} draft
          {data.draft.rounds !== undefined ? `, ${data.draft.rounds} rounds` : ''}. League cap: 2
          keepers per team.
        </p>
        {data.warnings.length > 0 && (
          <details>
            <summary>{data.warnings.length} note(s) from data assembly</summary>
            <ul>
              {data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="card">
        <h2>
          Who was kept in {data.previousLeague.season}? <span className="tag">Rule 1.1</span>
        </h2>
        <p className="muted small">
          Players kept last season can&apos;t be kept again this year.
          {data.autoDetectedKeepers.length > 0
            ? ' Auto-detected keepers are pre-filled below — correct the list if needed.'
            : ' Nothing was auto-detected for this draft, so add each kept player by name.'}
        </p>
        {props.importedCount != null && (
          <p className="muted small">
            The league&apos;s saved list has {props.importedCount} keeper
            {props.importedCount === 1 ? '' : 's'}
            {props.savedBy ? ` (saved by ${props.savedBy})` : ''}.
            {props.isDirty ? ' Your local edits below differ from it.' : ''}
          </p>
        )}

        {preDetected.length > 0 && (
          <div className="detect">
            <p>
              On rosters before the {data.previousLeague.season} draft started — marked as{' '}
              {data.previousLeague.season} keepers:
            </p>
            <ul>
              {preDetected.map((detection) => (
                <li key={detection.playerId}>
                  {playerLabel(detection.playerId, data.playerInfo[detection.playerId])}
                  {teamNameOf(detection.teamId) !== undefined
                    ? ` — ${teamNameOf(detection.teamId)}`
                    : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {skippedByTeam.length > 0 && (
          <p className="muted small">
            Skipped slots in the {data.previousLeague.season} draft:{' '}
            {skippedByTeam.map(([name, rounds]) => `${name} (R${rounds.join(', R')})`).join('; ')}.
          </p>
        )}

        {keeperList.length === 0 ? (
          <p className="empty">No previous-season keepers entered yet.</p>
        ) : (
          <ul className="chips">
            {keeperList.map((playerId) => (
              <li key={playerId}>
                <span>{playerLabel(playerId, data.playerInfo[playerId])}</span>
                <button
                  type="button"
                  aria-label={`Remove ${data.playerInfo[playerId]?.name ?? playerId}`}
                  onClick={() => props.onToggle(playerId)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search players to add (2+ letters)…"
          aria-label="Search players"
        />
        {matches.length > 0 && (
          <ul className="results">
            {matches.map(([playerId, info]) => (
              <li key={playerId}>
                <span>{playerLabel(playerId, info)}</span>
                <button type="button" onClick={() => props.onToggle(playerId)}>
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {props.saveMessage && <div className="banner small">{props.saveMessage}</div>}
      <div className="row between">
        <div className="row">
          {props.onBack && (
            <button type="button" onClick={props.onBack}>
              ← Different league
            </button>
          )}
          {props.canSave && props.onSave && (
            <button
              type="button"
              title="Save this keeper list for everyone in the league"
              disabled={props.saving || (!props.isDirty && props.importedCount != null)}
              onClick={props.onSave}
            >
              {props.saving
                ? 'Saving…'
                : props.isDirty || props.importedCount == null
                  ? 'Save for the league'
                  : 'Saved'}
            </button>
          )}
        </div>
        <button type="button" className="primary" onClick={props.onContinue}>
          Show keeper boards →
        </button>
      </div>
    </div>
  )
}
