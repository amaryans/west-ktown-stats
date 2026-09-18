import { useState, type FormEvent } from 'react'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import { REPO_URL } from '../../lib/config.ts'
import type { StatSuggestion } from '../../lib/db.ts'

export default function Suggestions() {
  const {
    suggestions,
    me,
    isCommissioner,
    nameOf,
    createSuggestion,
    updateSuggestion,
    deleteSuggestion,
  } = useLeague()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await createSuggestion({ title: title.trim(), description: description.trim() || null })
      setTitle('')
      setDescription('')
      setMsg({
        ok: true,
        text: 'Thanks! Your suggestion is queued and will become a GitHub issue.',
      })
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
      <form className="card stack" onSubmit={(e) => void submit(e)}>
        <h2>Suggest a stat</h2>
        <p className="muted small">
          Want to see something on the Stats tab? Describe it here. Each suggestion is filed as an
          issue on the site&apos;s GitHub repository automatically, so it gets tracked and built.
        </p>
        <div className="field">
          <label htmlFor="s-title">What stat?</label>
          <input
            id="s-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Luck index: record vs. expected record from points"
            minLength={3}
            maxLength={200}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="s-desc">How should it work? (optional)</label>
          <textarea
            id="s-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Where the numbers come from, how to calculate it, what the table should show…"
          />
        </div>
        {msg && <div className={msg.ok ? 'success small' : 'error small'}>{msg.text}</div>}
        <div className="row between">
          <a className="small muted" href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
            See open issues ↗
          </a>
          <button className="primary" type="submit" disabled={busy || title.trim().length < 3}>
            {busy ? 'Sending…' : 'Suggest it'}
          </button>
        </div>
      </form>

      <div className="card">
        <h2>Suggestions so far</h2>
        {suggestions.length === 0 && <p className="empty">Nothing yet. Be the first.</p>}
        <div className="stack">
          {suggestions.map((s) => (
            <SuggestionRow
              key={s.id}
              suggestion={s}
              by={nameOf(s.user_id)}
              canDelete={isCommissioner || s.user_id === me?.id}
              canUpdate={isCommissioner}
              onStatus={(status) => void act(() => updateSuggestion(s.id, { status }))}
              onDelete={() => {
                if (window.confirm('Delete this suggestion?'))
                  void act(() => deleteSuggestion(s.id))
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SuggestionRow({
  suggestion: s,
  by,
  canDelete,
  canUpdate,
  onStatus,
  onDelete,
}: {
  suggestion: StatSuggestion
  by: string
  canDelete: boolean
  canUpdate: boolean
  onStatus: (status: StatSuggestion['status']) => void
  onDelete: () => void
}) {
  return (
    <div className="banner">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <strong>{s.title}</strong>
          {s.description && (
            <p className="muted small" style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-wrap' }}>
              {s.description}
            </p>
          )}
          <div className="muted small" style={{ marginTop: '0.35rem' }}>
            {by} · {new Date(s.created_at).toLocaleDateString()}
            {s.issue_url && (
              <>
                {' · '}
                <a href={s.issue_url} target="_blank" rel="noreferrer">
                  issue #{s.issue_number} ↗
                </a>
              </>
            )}
          </div>
        </div>
        <div className="row" style={{ gap: '0.4rem' }}>
          {canUpdate ? (
            <select
              aria-label="Suggestion status"
              style={{ width: 'auto', padding: '0.3rem 0.45rem' }}
              value={s.status}
              onChange={(e) => onStatus(e.target.value as StatSuggestion['status'])}
            >
              {(['new', 'filed', 'done', 'declined'] as const).map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          ) : (
            <span className={`badge ${s.status}`}>{s.status === 'new' ? 'queued' : s.status}</span>
          )}
          {canDelete && (
            <button type="button" className="small danger" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
