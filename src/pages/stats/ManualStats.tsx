import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import {
  guessSubjectColumn,
  guessValueColumn,
  parseTable,
  rowsForImport,
  type ParsedTable,
} from '../../features/stats/parseTable.ts'
import type { StatDefinition, StatEntry } from '../../lib/db.ts'

const WEEK_OPTIONS = [
  { value: 0, label: 'Season total' },
  ...Array.from({ length: 18 }, (_, i) => ({ value: i + 1, label: `Week ${i + 1}` })),
]

export default function ManualStats() {
  const { statDefinitions, statEntries, settings, isCommissioner } = useLeague()
  const [definitionId, setDefinitionId] = useState<string>(() => statDefinitions[0]?.id ?? '')
  const [season, setSeason] = useState<number>(settings?.season ?? new Date().getFullYear())
  const [mode, setMode] = useState<'browse' | 'add' | 'paste'>('browse')

  const definition =
    statDefinitions.find((d) => d.id === definitionId) ?? statDefinitions[0] ?? null
  const seasons = useMemo(
    () =>
      [...new Set([settings?.season ?? 0, ...statEntries.map((e) => e.season)])]
        .filter(Boolean)
        .sort((a, b) => b - a),
    [statEntries, settings],
  )

  if (statDefinitions.length === 0) {
    return (
      <div className="card">
        <h2>Manual stats</h2>
        <p className="muted">
          Manual stats are numbers typed or pasted in from NFL.com (targets, snap counts, red-zone
          touches — anything Sleeper doesn&apos;t give us). Nothing is defined yet.
        </p>
        {isCommissioner ? (
          <Link className="btn primary" to="/settings/stats">
            Define the first stat
          </Link>
        ) : (
          <p className="muted small">
            Ask the commissioner to define a stat in Settings → Stat definitions.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ms-def">Stat</label>
            <select
              id="ms-def"
              value={definition?.id ?? ''}
              onChange={(e) => setDefinitionId(e.target.value)}
            >
              {statDefinitions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {d.unit ? ` (${d.unit})` : ''}
                </option>
              ))}
            </select>
            {definition?.description && <span className="help">{definition.description}</span>}
          </div>
          <div className="field">
            <label htmlFor="ms-season">Season</label>
            <select
              id="ms-season"
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {!seasons.includes(season) && <option value={season}>{season}</option>}
            </select>
          </div>
        </div>
        <div className="row mt">
          <button
            type="button"
            className={mode === 'browse' ? 'primary small' : 'small'}
            onClick={() => setMode('browse')}
          >
            Browse
          </button>
          <button
            type="button"
            className={mode === 'add' ? 'primary small' : 'small'}
            onClick={() => setMode('add')}
          >
            Add one
          </button>
          <button
            type="button"
            className={mode === 'paste' ? 'primary small' : 'small'}
            onClick={() => setMode('paste')}
          >
            Paste from NFL.com
          </button>
          {isCommissioner && (
            <Link to="/settings/stats" className="small muted" style={{ marginLeft: 'auto' }}>
              Manage definitions
            </Link>
          )}
        </div>
      </div>

      {definition && mode === 'add' && (
        <AddOne definition={definition} season={season} onDone={() => setMode('browse')} />
      )}
      {definition && mode === 'paste' && (
        <PasteImport definition={definition} season={season} onDone={() => setMode('browse')} />
      )}
      {definition && <EntriesTable definition={definition} season={season} />}
    </div>
  )
}

function AddOne({
  definition,
  season,
  onDone,
}: {
  definition: StatDefinition
  season: number
  onDone: () => void
}) {
  const { upsertStatEntries } = useLeague()
  const [week, setWeek] = useState(0)
  const [subject, setSubject] = useState('')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await upsertStatEntries([
        {
          definition_id: definition.id,
          season,
          week,
          subject: subject.trim(),
          value: Number(value),
          note: note.trim() || null,
          source_url: sourceUrl.trim() || null,
        },
      ])
      setSubject('')
      setValue('')
      onDone()
    } catch (err) {
      setMsg(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={(e) => void submit(e)}>
      <h2>
        Add {definition.label} · {season}
      </h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ao-week">Week</label>
          <select id="ao-week" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            {WEEK_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ao-subject">{subjectLabel(definition)}</label>
          <input
            id="ao-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="ao-value">Value{definition.unit ? ` (${definition.unit})` : ''}</label>
          <input
            id="ao-value"
            type="number"
            step="any"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="ao-source">Source URL (optional)</label>
          <input
            id="ao-source"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.nfl.com/stats/…"
          />
        </div>
        <div className="field wide">
          <label htmlFor="ao-note">Note (optional)</label>
          <input id="ao-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {msg && <div className="error small">{msg}</div>}
      <div className="row end">
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function PasteImport({
  definition,
  season,
  onDone,
}: {
  definition: StatDefinition
  season: number
  onDone: () => void
}) {
  const { upsertStatEntries } = useLeague()
  const [text, setText] = useState('')
  const [week, setWeek] = useState(0)
  const [sourceUrl, setSourceUrl] = useState('')
  const [subjectCol, setSubjectCol] = useState<number | null>(null)
  const [valueCol, setValueCol] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const table: ParsedTable = useMemo(() => parseTable(text), [text])
  const sCol = subjectCol ?? (table.header.length ? guessSubjectColumn(table) : 0)
  const vCol = valueCol ?? (table.header.length ? guessValueColumn(table, sCol) : 1)
  const { rows, skipped } = useMemo(() => rowsForImport(table, sCol, vCol), [table, sCol, vCol])

  async function submit() {
    setBusy(true)
    setMsg(null)
    try {
      await upsertStatEntries(
        rows.map((r) => ({
          definition_id: definition.id,
          season,
          week,
          subject: r.subject,
          value: r.value,
          note: null,
          source_url: sourceUrl.trim() || null,
        })),
      )
      setMsg({ ok: true, text: `Saved ${rows.length} row${rows.length === 1 ? '' : 's'}.` })
      setText('')
      onDone()
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card stack">
      <h2>
        Paste {definition.label} · {season}
      </h2>
      <p className="muted small">
        On NFL.com open a stats table, select the rows (header included is fine), copy, and paste
        below. Tab-, comma- or space-separated columns all work. Then pick which column is the{' '}
        {subjectLabel(definition).toLowerCase()} and which holds the number.
      </p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="pi-week">Week</label>
          <select id="pi-week" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
            {WEEK_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pi-source">Source URL (optional)</label>
          <input
            id="pi-source"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.nfl.com/stats/…"
          />
        </div>
        <div className="field wide">
          <label htmlFor="pi-text">Pasted table</label>
          <textarea
            id="pi-text"
            rows={8}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setSubjectCol(null)
              setValueCol(null)
            }}
            placeholder={'Player\tRec\tTgt\tYds\nJa’Marr Chase\t127\t175\t1708'}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}
          />
        </div>
      </div>
      {table.header.length > 0 && (
        <>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pi-scol">{subjectLabel(definition)} column</label>
              <select
                id="pi-scol"
                value={sCol}
                onChange={(e) => setSubjectCol(Number(e.target.value))}
              >
                {table.header.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pi-vcol">Value column</label>
              <select
                id="pi-vcol"
                value={vCol}
                onChange={(e) => setValueCol(Number(e.target.value))}
              >
                {table.header.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Column ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{subjectLabel(definition)}</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((r) => (
                  <tr key={r.subject}>
                    <td>{r.subject}</td>
                    <td className="num">{r.value}</td>
                  </tr>
                ))}
                {rows.length > 8 && (
                  <tr>
                    <td colSpan={2} className="muted small">
                      …and {rows.length - 8} more
                    </td>
                  </tr>
                )}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="muted">
                      No usable rows yet — check the column choices.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {skipped.length > 0 && (
            <p className="muted small">
              Skipped {skipped.length} row{skipped.length === 1 ? '' : 's'} without a number or
              duplicated: {skipped.slice(0, 5).join(', ')}
              {skipped.length > 5 ? '…' : ''}
            </p>
          )}
        </>
      )}
      {msg && <div className={msg.ok ? 'success small' : 'error small'}>{msg.text}</div>}
      <div className="row end">
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || rows.length === 0}
          onClick={() => void submit()}
        >
          {busy ? 'Saving…' : `Save ${rows.length} row${rows.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}

function EntriesTable({ definition, season }: { definition: StatDefinition; season: number }) {
  const { statEntries, me, isCommissioner, nameOf, updateStatEntry, deleteStatEntry } = useLeague()
  const [weekFilter, setWeekFilter] = useState<number | 'all'>('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const entries = statEntries.filter(
    (e) =>
      e.definition_id === definition.id &&
      e.season === season &&
      (weekFilter === 'all' || e.week === weekFilter),
  )
  const weeks = [
    ...new Set(
      statEntries
        .filter((e) => e.definition_id === definition.id && e.season === season)
        .map((e) => e.week),
    ),
  ].sort((a, b) => a - b)
  const columns = useMemo<SortColumn<StatEntry>[]>(
    () => [
      { key: 'subject', label: subjectLabel(definition), get: (e) => e.subject },
      { key: 'week', label: 'Week', get: (e) => e.week, defaultDir: 'asc' },
      { key: 'value', label: definition.unit ?? 'Value', get: (e) => e.value, className: 'num' },
      { key: 'by', label: 'Entered by', get: (e) => nameOf(e.entered_by) },
    ],
    [definition, nameOf],
  )
  const baseOrder = useMemo(
    () => [...entries].sort((a, b) => a.week - b.week || b.value - a.value),
    [entries],
  )
  const { sort, toggle, sorted } = useSortable(baseOrder, columns)
  const canEdit = (e: StatEntry) => isCommissioner || e.entered_by === me?.id

  async function save(e: StatEntry) {
    setMsg(null)
    try {
      await updateStatEntry(e.id, { value: Number(draft) })
      setEditing(null)
    } catch (err) {
      setMsg(errorMessage(err))
    }
  }

  async function remove(e: StatEntry) {
    if (!window.confirm(`Delete ${e.subject} (${e.value})?`)) return
    setMsg(null)
    try {
      await deleteStatEntry(e.id)
    } catch (err) {
      setMsg(errorMessage(err))
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>
          {definition.label} · {season}
        </h2>
        {weeks.length > 1 && (
          <select
            aria-label="Filter by week"
            style={{ width: 'auto', padding: '0.3rem 0.45rem' }}
            value={weekFilter}
            onChange={(e) =>
              setWeekFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
          >
            <option value="all">All weeks</option>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {w === 0 ? 'Season total' : `Week ${w}`}
              </option>
            ))}
          </select>
        )}
      </div>
      {msg && <div className="error small mb">{msg}</div>}
      {sorted.length === 0 ? (
        <p className="empty">
          No {definition.label.toLowerCase()} entered for {season} yet.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                {columns.map((c) => (
                  <SortableTh key={c.key} column={c} sort={sort} onToggle={toggle} />
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((e, i) => (
                <tr key={e.id}>
                  <td className="num muted">{i + 1}</td>
                  <td>
                    {e.subject}
                    {e.note && <div className="muted small">{e.note}</div>}
                  </td>
                  <td className="nowrap">{e.week === 0 ? 'Season' : `Wk ${e.week}`}</td>
                  <td className="num">
                    {editing === e.id ? (
                      <input
                        aria-label={`Value for ${e.subject}`}
                        type="number"
                        step="any"
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') void save(e)
                          if (ev.key === 'Escape') setEditing(null)
                        }}
                        style={{ width: '6rem', textAlign: 'right' }}
                        autoFocus
                      />
                    ) : (
                      e.value.toLocaleString()
                    )}
                  </td>
                  <td className="muted small nowrap">
                    {nameOf(e.entered_by)}
                    {e.source_url && (
                      <>
                        {' '}
                        <a href={e.source_url} target="_blank" rel="noreferrer" title="Source">
                          ↗
                        </a>
                      </>
                    )}
                  </td>
                  <td className="nowrap right">
                    {canEdit(e) &&
                      (editing === e.id ? (
                        <>
                          <button
                            type="button"
                            className="small primary"
                            onClick={() => void save(e)}
                          >
                            Save
                          </button>{' '}
                          <button type="button" className="small" onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="small"
                            onClick={() => {
                              setEditing(e.id)
                              setDraft(String(e.value))
                            }}
                          >
                            Edit
                          </button>{' '}
                          <button
                            type="button"
                            className="small danger"
                            onClick={() => void remove(e)}
                          >
                            Delete
                          </button>
                        </>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function subjectLabel(definition: StatDefinition): string {
  return definition.scope === 'player' ? 'Player' : definition.scope === 'team' ? 'Team' : 'Subject'
}
