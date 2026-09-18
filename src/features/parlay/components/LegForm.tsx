import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, useLeague } from '../../../context/LeagueContext.tsx'
import type { Leg, LegMarket, OddsRef, Week } from '../../../lib/db.ts'
import { useParlay } from '../ParlayContext.tsx'
import type { LegPrefill } from '../lib/board.ts'
import { parseAmerican } from '../lib/odds.ts'
import { MemberSelect } from './Badges.tsx'

const MARKETS: [LegMarket, string][] = [
  ['spread', 'Spread'],
  ['moneyline', 'Moneyline'],
  ['total', 'Total (O/U)'],
  ['prop', 'Player / team prop'],
  ['other', 'Other'],
]

/**
 * Add or edit one leg. `leg` is an existing row when editing; `prefill`
 * comes from the odds board; `forUserId` picks who the leg belongs to.
 */
export default function LegForm({
  week,
  leg = null,
  prefill = null,
  forUserId = null,
  allowMemberChoice = false,
  onDone,
}: {
  week: Week
  leg?: Leg | null
  prefill?: LegPrefill | null
  forUserId?: string | null
  allowMemberChoice?: boolean
  onDone?: () => void
}) {
  const { me, profiles, settings, isCommissioner } = useLeague()
  const { legsForWeek, upsertLeg, updateLeg } = useParlay()
  const existingLegs = legsForWeek(week.id)
  const uid = useId()

  const [userId, setUserId] = useState<string | null>(leg?.user_id ?? forUserId ?? me?.id ?? null)
  const [game, setGame] = useState(leg?.game ?? prefill?.game ?? '')
  const [market, setMarket] = useState<LegMarket>(leg?.market ?? prefill?.market ?? 'spread')
  const [pick, setPick] = useState(leg?.pick ?? prefill?.pick ?? '')
  const [odds, setOdds] = useState<string>(String(leg?.odds ?? prefill?.odds ?? ''))
  // A leg picked from the odds board stays linked to its game/line so the
  // odds can be refreshed; editing the pick text by hand unlinks it.
  const [link, setLink] = useState<{ game_id: string | null; odds_ref: OddsRef | null }>({
    game_id: leg?.game_id ?? prefill?.game_id ?? null,
    odds_ref: leg?.odds_ref ?? prefill?.odds_ref ?? null,
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (prefill) {
      setGame(prefill.game ?? '')
      setMarket(prefill.market ?? 'spread')
      setPick(prefill.pick ?? '')
      setOdds(String(prefill.odds ?? ''))
      setLink({ game_id: prefill.game_id ?? null, odds_ref: prefill.odds_ref ?? null })
    }
  }, [prefill])
  const unlink = () => setLink({ game_id: null, odds_ref: null })

  const excluded = existingLegs.filter((l) => l.id !== leg?.id).map((l) => l.user_id)
  if (!settings?.loser_adds_leg && week.loser_id) excluded.push(week.loser_id)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = parseAmerican(odds)
    if (parsed !== null && Number.isNaN(parsed)) {
      setError(
        'Odds should be American style, like -110 or +150 (or leave blank to fill in later).',
      )
      return
    }
    if (!pick.trim()) {
      setError('Describe the pick, e.g. "Ravens -3.5" or "Over 47.5".')
      return
    }
    if (!userId) {
      setError('Pick whose leg this is.')
      return
    }
    setSaving(true)
    try {
      const fields: Partial<Leg> = {
        game: game.trim() || null,
        market,
        pick: pick.trim(),
        odds: parsed,
        game_id: link.game_id,
        odds_ref: link.odds_ref,
      }
      if (leg) await updateLeg(leg.id, fields)
      else await upsertLeg({ ...fields, week_id: week.id, user_id: userId })
      onDone?.()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="stack">
      {isCommissioner && (allowMemberChoice || (!leg && userId !== me?.id)) && (
        <div className="field">
          <label htmlFor={`${uid}-whose-leg`}>Whose leg</label>
          <MemberSelect
            id={`${uid}-whose-leg`}
            value={userId}
            onChange={setUserId}
            profiles={profiles}
            exclude={excluded}
            disabled={Boolean(leg)}
          />
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${uid}-game`}>Game</label>
          <input
            id={`${uid}-game`}
            value={game}
            onChange={(e) => {
              setGame(e.target.value)
              unlink()
            }}
            placeholder="Chiefs @ Ravens"
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-type`}>Type</label>
          <select
            id={`${uid}-type`}
            value={market}
            onChange={(e) => {
              setMarket(e.target.value as LegMarket)
              unlink()
            }}
          >
            {MARKETS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-pick`}>Pick</label>
          <input
            id={`${uid}-pick`}
            value={pick}
            onChange={(e) => {
              setPick(e.target.value)
              unlink()
            }}
            placeholder="Ravens -3.5"
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-odds`}>Odds (American)</label>
          <input
            id={`${uid}-odds`}
            value={odds}
            onChange={(e) => setOdds(e.target.value)}
            placeholder="-110"
            inputMode="numeric"
          />
        </div>
      </div>
      {error && <div className="error small">{error}</div>}
      <div className="row between">
        <span className="small muted">
          Not sure of the line?{' '}
          <Link to={`/parlay/board?season=${week.season}&week=${week.week}`}>
            Pick from the odds board
          </Link>{' '}
          or leave odds blank and anyone can fill them in later.
        </span>
        <div className="row">
          {onDone && (
            <button type="button" onClick={onDone}>
              Cancel
            </button>
          )}
          <button className="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : leg ? 'Save leg' : 'Add leg'}
          </button>
        </div>
      </div>
    </form>
  )
}
