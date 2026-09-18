import { useState, type FormEvent } from 'react'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import type { StatScope } from '../../lib/db.ts'

const SCOPES: { value: StatScope; label: string }[] = [
  { value: 'player', label: 'NFL player' },
  { value: 'team', label: 'Fantasy team' },
  { value: 'league', label: 'League-wide' },
]

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function StatDefinitionsSettings() {
  const {
    statDefinitions,
    statEntries,
    createStatDefinition,
    updateStatDefinition,
    deleteStatDefinition,
  } = useLeague()
  const [form, setForm] = useState({
    label: '',
    unit: '',
    description: '',
    scope: 'player' as StatScope,
  })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await createStatDefinition({
        key: slug(form.label),
        label: form.label.trim(),
        unit: form.unit.trim() || null,
        description: form.description.trim() || null,
        scope: form.scope,
      })
      setForm({ label: '', unit: '', description: '', scope: 'player' })
      setMsg({ ok: true, text: 'Stat defined. Members can now enter values on the Stats tab.' })
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function act(fn: () => Promise<void>) {
    setMsg(null)
    try {
      await fn()
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) })
    }
  }

  return (
    <div className="stack">
      <form className="card stack" onSubmit={(e) => void create(e)}>
        <h2>Define a manual stat</h2>
        <p className="muted small">
          A definition is a named number that members can type or paste in from NFL.com — for
          example &quot;Targets&quot; per player, or &quot;Bench points&quot; per fantasy team.
        </p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="d-label">Name</label>
            <input
              id="d-label"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Targets"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="d-unit">Unit (optional)</label>
            <input
              id="d-unit"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="tgt"
            />
          </div>
          <div className="field">
            <label htmlFor="d-scope">Each row is a…</label>
            <select
              id="d-scope"
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as StatScope }))}
            >
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="d-desc">Description (optional)</label>
            <input
              id="d-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Where it comes from on NFL.com and how to read it"
            />
          </div>
        </div>
        {msg && <div className={msg.ok ? 'success small' : 'error small'}>{msg.text}</div>}
        <div className="row end">
          <button className="primary" type="submit" disabled={busy || !form.label.trim()}>
            {busy ? 'Saving…' : 'Add stat'}
          </button>
        </div>
      </form>

      <div className="card">
        <h2>Defined stats</h2>
        {statDefinitions.length === 0 && <p className="empty">None yet.</p>}
        <div className="table-wrap">
          {statDefinitions.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Scope</th>
                  <th>Unit</th>
                  <th className="num">Entries</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {statDefinitions.map((d) => {
                  const count = statEntries.filter((e) => e.definition_id === d.id).length
                  return (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.label}</strong>
                        {d.description && <div className="muted small">{d.description}</div>}
                      </td>
                      <td className="nowrap">{SCOPES.find((s) => s.value === d.scope)?.label}</td>
                      <td>{d.unit ?? '—'}</td>
                      <td className="num">{count}</td>
                      <td className="nowrap right">
                        <button
                          type="button"
                          className="small"
                          onClick={() => {
                            const label = window.prompt('Rename stat', d.label)
                            if (label && label.trim() && label.trim() !== d.label)
                              void act(() => updateStatDefinition(d.id, { label: label.trim() }))
                          }}
                        >
                          Rename
                        </button>{' '}
                        <button
                          type="button"
                          className="small danger"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete "${d.label}" and its ${count} entries? This cannot be undone.`,
                              )
                            )
                              void act(() => deleteStatDefinition(d.id))
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
