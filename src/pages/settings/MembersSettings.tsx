import { useState } from 'react'
import AddMissingMembers from '../../components/AddMissingMembers.tsx'
import SleeperTeamSelect from '../../components/SleeperTeamSelect.tsx'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import type { Profile } from '../../lib/db.ts'

export default function MembersSettings() {
  const { profiles, me, sleeper, updateMember, deletePlaceholderMember } = useLeague()
  const [memberMsg, setMemberMsg] = useState<string | null>(null)

  async function act(fn: () => Promise<void>) {
    setMemberMsg(null)
    try {
      await fn()
    } catch (err) {
      setMemberMsg(errorMessage(err))
    }
  }

  async function member(id: string, fields: Partial<Profile>) {
    setMemberMsg(null)
    try {
      await updateMember(id, fields)
    } catch (err) {
      const text = errorMessage(err)
      setMemberMsg(
        text.includes('profiles_sleeper_user_idx')
          ? 'That Sleeper team is already claimed by another member.'
          : text,
      )
    }
  }

  // Link unlinked members to Sleeper teams whose display or team name matches.
  async function autoLink() {
    setMemberMsg(null)
    const teams = sleeper.data?.teams ?? []
    const taken = new Set(profiles.map((p) => p.sleeper_user_id).filter(Boolean))
    let linked = 0
    const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase()
    try {
      for (const p of profiles) {
        if (p.sleeper_user_id) continue
        const matches = teams.filter(
          (t) =>
            t.userId &&
            !taken.has(t.userId) &&
            (norm(t.displayName) === norm(p.display_name) ||
              (p.team_name && norm(t.teamName) === norm(p.team_name))),
        )
        const match = matches[0]
        if (matches.length === 1 && match?.userId) {
          await updateMember(p.id, { sleeper_user_id: match.userId })
          taken.add(match.userId)
          linked += 1
        }
      }
      setMemberMsg(
        linked
          ? `Linked ${linked} member${linked === 1 ? '' : 's'} by name.`
          : 'No unambiguous name matches found. Link the rest by hand.',
      )
    } catch (err) {
      setMemberMsg(errorMessage(err))
    }
  }

  return (
    <div className="card stack">
      <div className="card-header">
        <h2>
          Members <span className="muted small">(commissioner)</span>
        </h2>
        {sleeper.data && (
          <button type="button" className="small" onClick={() => void autoLink()}>
            Auto-link by name
          </button>
        )}
      </div>
      <p className="muted small">
        Each member claims their Sleeper team when they sign up or in their profile; fix any
        mistakes here. Members marked &quot;not signed up&quot; are placeholders you added from
        Sleeper so they show in the parlay tables; they merge into the real account when that person
        signs up with the same team. Commissioners can change league settings, define stats and
        publish shared data; there must always be at least one.
      </p>
      <AddMissingMembers />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Team</th>
              <th>Sleeper team</th>
              <th>Commissioner</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className={p.id === me?.id ? 'me' : undefined}>
                <td className="nowrap">
                  {p.display_name}
                  {p.is_placeholder && (
                    <span className="badge" style={{ marginLeft: '0.4rem' }}>
                      not signed up
                    </span>
                  )}
                </td>
                <td className="muted">{p.team_name ?? '—'}</td>
                <td>
                  <SleeperTeamSelect
                    id={`sleeper-${p.id}`}
                    value={p.sleeper_user_id}
                    allowClaimed
                    onChange={(v) => void member(p.id, { sleeper_user_id: v })}
                  />
                </td>
                <td>
                  {p.is_placeholder ? (
                    <button
                      type="button"
                      className="small danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove placeholder ${p.display_name}? Their parlay legs go with them.`,
                          )
                        )
                          void act(() => deletePlaceholderMember(p.id))
                      }}
                    >
                      Remove
                    </button>
                  ) : (
                    <input
                      type="checkbox"
                      aria-label={`${p.display_name} is commissioner`}
                      checked={p.is_commissioner}
                      onChange={(e) => void member(p.id, { is_commissioner: e.target.checked })}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {memberMsg && <div className="small">{memberMsg}</div>}
    </div>
  )
}
