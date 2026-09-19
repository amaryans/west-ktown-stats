import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import HistoryStatus from '../../components/HistoryStatus.tsx'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import { knownManagers, legacyRanked } from '../../features/standings/legacy.ts'
import { fmtPts } from '../../features/standings/SeasonTable.tsx'
import { formatRecord } from '../../features/standings/standings.ts'
import type { LegacySeason, LegacyTeam } from '../../lib/db.ts'
import { ordinal } from '../team/TeamPage.tsx'

/** A row being edited: numbers stay as text until saved so half-typed values do not snap. */
interface DraftTeam {
  key: number
  teamName: string
  /** A Sleeper user id from the manager picker, or '' for "not on Sleeper". */
  sleeperUserId: string
  ownerName: string
  wins: string
  losses: string
  ties: string
  pointsFor: string
  pointsAgainst: string
  playoffFinish: string
}

let nextKey = 1
function blankRow(): DraftTeam {
  return {
    key: nextKey++,
    teamName: '',
    sleeperUserId: '',
    ownerName: '',
    wins: '',
    losses: '',
    ties: '',
    pointsFor: '',
    pointsAgainst: '',
    playoffFinish: '',
  }
}

function rowFromTeam(t: LegacyTeam): DraftTeam {
  return {
    key: nextKey++,
    teamName: t.teamName,
    sleeperUserId: t.sleeperUserId ?? '',
    ownerName: t.ownerName,
    wins: String(t.wins),
    losses: String(t.losses),
    ties: t.ties ? String(t.ties) : '',
    pointsFor: t.pointsFor ? String(t.pointsFor) : '',
    pointsAgainst: t.pointsAgainst ? String(t.pointsAgainst) : '',
    playoffFinish: t.playoffFinish ? String(t.playoffFinish) : '',
  }
}

const num = (s: string) => {
  const n = Number(String(s).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Rows pasted from a spreadsheet: one team per line, columns separated by
 * tabs or commas, in the order team, manager, W, L, T, PF, PA, finish.
 * Missing trailing columns are fine; a header line is skipped.
 */
export function parsePastedTeams(text: string): Omit<DraftTeam, 'key' | 'sleeperUserId'>[] {
  const rows: Omit<DraftTeam, 'key' | 'sleeperUserId'>[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cells = line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim())
    if (cells.length < 3) continue
    if (/^(team|manager|owner|w|wins)$/i.test(cells[0] ?? '') || /^(w|wins)$/i.test(cells[2] ?? ''))
      continue
    rows.push({
      teamName: cells[0] ?? '',
      ownerName: cells[1] ?? '',
      wins: cells[2] ?? '',
      losses: cells[3] ?? '',
      ties: cells[4] ?? '',
      pointsFor: cells[5] ?? '',
      pointsAgainst: cells[6] ?? '',
      playoffFinish: cells[7] ?? '',
    })
  }
  return rows
}

/** Commissioner: final standings for seasons before the league moved to Sleeper. */
export default function LegacySeasonsSettings() {
  const { legacySeasons, history, nameOf, upsertLegacySeason, deleteLegacySeason } = useLeague()
  const [editing, setEditing] = useState<LegacySeason | 'new' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const sleeperYears = useMemo(
    () =>
      (history.data?.seasons ?? [])
        .filter((s) => s.source !== 'manual')
        .map((s) => Number(s.season)),
    [history.data],
  )

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Final standings from the years before the league was on Sleeper. Seasons already added to
        Sleeper&apos;s league history are read from there automatically; use this only for years
        Sleeper does not have. They join the <Link to="/history">standings history</Link>, the{' '}
        <Link to="/stats">all-time table</Link> and each manager&apos;s team history. Those years
        have no weekly scores, so they carry a record, points and playoff finish but no games
        against the median.
      </p>
      <HistoryStatus />
      {msg && <div className="banner small">{msg}</div>}

      <div className="card">
        <div className="card-header">
          <h2>Past seasons</h2>
          {editing === null && (
            <button type="button" className="primary" onClick={() => setEditing('new')}>
              Add a season
            </button>
          )}
        </div>
        {legacySeasons.length === 0 ? (
          <p className="muted">None entered yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Platform</th>
                  <th className="num">Teams</th>
                  <th>Champion</th>
                  <th>Saved</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {legacySeasons.map((l) => {
                  const champ = l.teams.find((t) => t.playoffFinish === 1)
                  const clash = sleeperYears.includes(l.season)
                  return (
                    <tr key={l.id}>
                      <td className="nowrap">
                        {l.season}
                        {clash && (
                          <div className="error small">Sleeper has this year; it is ignored.</div>
                        )}
                      </td>
                      <td>{l.source || <span className="muted">—</span>}</td>
                      <td className="num">{l.teams.length}</td>
                      <td>
                        {champ ? (
                          <>
                            {champ.teamName || champ.ownerName}
                            {champ.teamName && champ.ownerName ? (
                              <div className="muted small">{champ.ownerName}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="muted small nowrap">
                        {nameOf(l.updated_by)} · {new Date(l.updated_at).toLocaleDateString()}
                      </td>
                      <td className="nowrap">
                        <div className="row end">
                          <button type="button" className="small" onClick={() => setEditing(l)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="small danger"
                            onClick={async () => {
                              if (!confirm(`Delete the ${l.season} season?`)) return
                              setMsg(null)
                              try {
                                await deleteLegacySeason(l.id)
                              } catch (err) {
                                setMsg(errorMessage(err))
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== null && (
        <SeasonEditor
          initial={editing === 'new' ? null : editing}
          takenSeasons={[
            ...sleeperYears,
            ...legacySeasons
              .filter((l) => editing === 'new' || l.id !== editing.id)
              .map((l) => l.season),
          ]}
          onCancel={() => setEditing(null)}
          onSave={async (fields) => {
            setMsg(null)
            try {
              await upsertLegacySeason(fields)
              setEditing(null)
              setMsg(`Saved the ${fields.season} season.`)
            } catch (err) {
              setMsg(errorMessage(err))
            }
          }}
        />
      )}
    </div>
  )
}

function SeasonEditor({
  initial,
  takenSeasons,
  onCancel,
  onSave,
}: {
  initial: LegacySeason | null
  takenSeasons: number[]
  onCancel: () => void
  onSave: (fields: Pick<LegacySeason, 'season' | 'source' | 'notes' | 'teams'>) => Promise<void>
}) {
  const { history, profiles } = useLeague()
  const [season, setSeason] = useState(initial ? String(initial.season) : '')
  const [source, setSource] = useState(initial?.source ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [rows, setRows] = useState<DraftTeam[]>(() =>
    initial ? initial.teams.map(rowFromTeam) : Array.from({ length: 10 }, blankRow),
  )
  const [paste, setPaste] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Managers the picker offers: everyone seen in the league's history plus
  // signed-up members with a Sleeper team, so a past team links to a person.
  const managers = useMemo(() => {
    const list = knownManagers(history.data)
    const seen = new Set(list.map((m) => m.ownerId))
    for (const p of profiles) {
      if (p.sleeper_user_id && !seen.has(p.sleeper_user_id)) {
        list.push({ ownerId: p.sleeper_user_id, ownerName: p.display_name, sleeper: true })
        seen.add(p.sleeper_user_id)
      }
    }
    return list.filter((m) => m.sleeper).sort((a, b) => a.ownerName.localeCompare(b.ownerName))
  }, [history.data, profiles])
  const managerName = (id: string) => managers.find((m) => m.ownerId === id)?.ownerName ?? ''

  useEffect(() => {
    // Fill in manager names for rows whose picker value we now recognise.
    setRows((rs) =>
      rs.map((r) =>
        r.sleeperUserId && !r.ownerName ? { ...r, ownerName: managerName(r.sleeperUserId) } : r,
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managers])

  function update(key: number, patch: Partial<DraftTeam>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function toTeams(): LegacyTeam[] {
    return rows
      .filter((r) => r.teamName.trim() || r.ownerName.trim() || r.sleeperUserId)
      .map((r) => ({
        teamName: r.teamName.trim(),
        ownerName: r.ownerName.trim() || managerName(r.sleeperUserId),
        sleeperUserId: r.sleeperUserId || null,
        wins: num(r.wins),
        losses: num(r.losses),
        ties: num(r.ties),
        pointsFor: num(r.pointsFor),
        pointsAgainst: num(r.pointsAgainst),
        playoffFinish: num(r.playoffFinish) > 0 ? Math.round(num(r.playoffFinish)) : null,
      }))
  }

  const preview = useMemo(() => {
    const teams = toTeams()
    if (teams.length === 0) return []
    return legacyRanked({
      id: 'preview',
      season: num(season) || 2000,
      source,
      notes,
      teams,
      updated_by: null,
      updated_at: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, season, source, notes, managers])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const year = Math.round(num(season))
    if (year < 1990 || year > 2100) return setError('Enter the season year, e.g. 2018.')
    if (takenSeasons.includes(year))
      return setError(`${year} is already covered (by Sleeper or an entered season).`)
    const teams = toTeams()
    if (teams.length < 2) return setError('Enter at least two teams.')
    const unnamed = teams.find((t) => !t.teamName && !t.ownerName)
    if (unnamed) return setError('Every team needs a team name or a manager.')
    const finishes = teams.map((t) => t.playoffFinish).filter((f): f is number => f !== null)
    if (new Set(finishes).size !== finishes.length)
      return setError('Two teams share a playoff finish.')
    setBusy(true)
    try {
      await onSave({
        season: year,
        source: source.trim() || null,
        notes: notes.trim() || null,
        teams,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="card-header">
        <h2>{initial ? `Edit ${initial.season}` : 'Add a past season'}</h2>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ls-season">Season</label>
          <input
            id="ls-season"
            inputMode="numeric"
            placeholder="2018"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            disabled={Boolean(initial)}
          />
        </div>
        <div className="field">
          <label htmlFor="ls-source">Platform</label>
          <input
            id="ls-source"
            placeholder="ESPN, Yahoo, NFL.com…"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ls-notes">Notes (optional)</label>
          <input
            id="ls-notes"
            placeholder="10 teams, 13-week season"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>
          Paste rows from a spreadsheet instead of typing
        </summary>
        <p className="muted small">
          One team per line: team, manager, wins, losses, ties, points for, points against, playoff
          finish. Tabs or commas between columns; later columns can be left off.
        </p>
        <textarea
          rows={4}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'Old Guard\tAustin\t9\t4\t0\t1500.5\t1400\t2'}
        />
        <button
          type="button"
          className="small mt"
          onClick={() => {
            const parsed = parsePastedTeams(paste)
            if (parsed.length === 0) return setError('Nothing to paste: no rows recognised.')
            setError(null)
            setRows(
              parsed.map((t) => {
                const match = managers.find(
                  (m) => m.ownerName.toLowerCase() === t.ownerName.trim().toLowerCase(),
                )
                return { ...blankRow(), ...t, sleeperUserId: match?.ownerId ?? '' }
              }),
            )
            setPaste('')
          }}
        >
          Use these rows
        </button>
      </details>

      <div className="table-wrap">
        <table className="legacy-editor">
          <thead>
            <tr>
              <th>Team</th>
              <th>Manager</th>
              <th className="num">W</th>
              <th className="num">L</th>
              <th className="num">T</th>
              <th className="num">PF</th>
              <th className="num">PA</th>
              <th className="num" title="Playoff finish, 1 = champion">
                Finish
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <input
                    aria-label="Team name"
                    value={r.teamName}
                    onChange={(e) => update(r.key, { teamName: e.target.value })}
                    style={{ minWidth: '9rem' }}
                  />
                </td>
                <td>
                  <div className="stack" style={{ gap: '0.25rem' }}>
                    <select
                      aria-label="Manager"
                      value={r.sleeperUserId}
                      onChange={(e) =>
                        update(r.key, {
                          sleeperUserId: e.target.value,
                          ownerName: e.target.value ? managerName(e.target.value) : r.ownerName,
                        })
                      }
                      style={{ minWidth: '10rem' }}
                    >
                      <option value="">Not on Sleeper (type a name)</option>
                      {managers.map((m) => (
                        <option key={m.ownerId} value={m.ownerId}>
                          {m.ownerName}
                        </option>
                      ))}
                    </select>
                    {!r.sleeperUserId && (
                      <input
                        aria-label="Manager name"
                        placeholder="Manager"
                        value={r.ownerName}
                        onChange={(e) => update(r.key, { ownerName: e.target.value })}
                      />
                    )}
                  </div>
                </td>
                {(['wins', 'losses', 'ties'] as const).map((f) => (
                  <td key={f} className="num">
                    <input
                      aria-label={f}
                      inputMode="numeric"
                      value={r[f]}
                      onChange={(e) => update(r.key, { [f]: e.target.value })}
                      style={{ width: '3.5rem', textAlign: 'right' }}
                    />
                  </td>
                ))}
                {(['pointsFor', 'pointsAgainst'] as const).map((f) => (
                  <td key={f} className="num">
                    <input
                      aria-label={f}
                      inputMode="decimal"
                      value={r[f]}
                      onChange={(e) => update(r.key, { [f]: e.target.value })}
                      style={{ width: '6rem', textAlign: 'right' }}
                    />
                  </td>
                ))}
                <td className="num">
                  <input
                    aria-label="Playoff finish"
                    inputMode="numeric"
                    placeholder="—"
                    value={r.playoffFinish}
                    onChange={(e) => update(r.key, { playoffFinish: e.target.value })}
                    style={{ width: '3.5rem', textAlign: 'right' }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="small"
                    aria-label="Remove row"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button
          type="button"
          className="small"
          onClick={() => setRows((rs) => [...rs, blankRow()])}
        >
          Add a team
        </button>
      </div>

      {preview.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 0.4rem' }}>How it will rank</h3>
          <ol className="muted small" style={{ margin: 0, paddingLeft: '1.4rem' }}>
            {preview.map((t) => (
              <li key={t.rosterId}>
                {t.teamName} ({t.ownerName}) · {formatRecord(t.h2h)} · {fmtPts(t.pointsFor)} PF
                {(() => {
                  const finish = toTeams()[t.rosterId - 1]?.playoffFinish
                  return finish ? ` · ${finish === 1 ? 'champion' : ordinal(finish)}` : ''
                })()}
              </li>
            ))}
          </ol>
        </div>
      )}

      {error && <div className="banner error small">{error}</div>}
      <div className="row">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save season'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
