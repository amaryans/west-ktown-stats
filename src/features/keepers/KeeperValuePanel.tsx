import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SortableTh, useSortable, type SortColumn } from '../../components/sortable.tsx'
import { errorMessage, useLeague } from '../../context/LeagueContext.tsx'
import { loadPlayers } from '../../lib/players.ts'
import { sleeper } from '../../lib/sleeper/client.ts'
import { assembleFromLeagueId, withKeeperEdits, type AssembledData } from './api/index.ts'
import { claimsForTeam, computeEligibility, type EligibilityResult } from './engine/index.ts'
import { editsFromEffective } from './lib/share.ts'
import { dqLabel, ruleLabel } from './lib/format.ts'
import { loadSleeperDraftOrders } from '../draft/sleeperDrafts.ts'
import { keeperValueRows, normalizeName, type AdpLookup, type KeeperValueRow } from './value.ts'

interface Loaded {
  data: AssembledData
  result: EligibilityResult
  sleeperRankById: Map<string, number>
  /** This team's slot in the following season's draft, when Sleeper knows it. */
  slot: number | null
}

/**
 * Keeper value for one team: every player it could keep out of `season`'s
 * roster, the round it can keep them in, and how that compares with the
 * player's ADP for the next draft.
 */
export default function KeeperValuePanel({
  leagueId,
  season,
  rosterId,
  ownerId,
  teamsCount,
  isCurrent,
}: {
  leagueId: string
  season: number
  rosterId: number
  ownerId: string | null
  teamsCount: number
  isCurrent: boolean
}) {
  const { keeperLists, statDefinitions, statEntries, isCommissioner } = useLeague()
  const nextSeason = season + 1
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    loaded: Loaded | null
  }>({
    loading: true,
    error: null,
    loaded: null,
  })

  // Manual ADP: a stat whose name mentions ADP, entered for the next draft's season.
  const manual = useMemo(() => {
    const def = statDefinitions.find((d) => /\badp\b/i.test(d.label) || /adp/i.test(d.key))
    if (!def) return { def: null, byName: new Map<string, number>(), season: null as number | null }
    const seasons = statEntries.filter((e) => e.definition_id === def.id).map((e) => e.season)
    const useSeason = seasons.includes(nextSeason)
      ? nextSeason
      : seasons.length
        ? Math.max(...seasons)
        : null
    const byName = new Map<string, number>()
    for (const e of statEntries) {
      if (e.definition_id === def.id && e.season === useSeason)
        byName.set(normalizeName(e.subject), e.value)
    }
    return { def, byName, season: useSeason }
  }, [statDefinitions, statEntries, nextSeason])

  useEffect(() => {
    let active = true
    setState({ loading: true, error: null, loaded: null })
    ;(async () => {
      const playersDump = await loadPlayers().catch(() => undefined)
      const data = await assembleFromLeagueId(sleeper, leagueId, { playersDump, exact: true })
      const saved = keeperLists.find((k) => k.season === season)
      const edits = saved
        ? editsFromEffective(new Set(saved.player_ids), new Set(data.autoDetectedKeepers))
        : { add: [], remove: [] }
      const result = computeEligibility(withKeeperEdits(data.engineInput, edits))
      const sleeperRankById = new Map<string, number>()
      if (playersDump) {
        const ids = new Set([
          ...result.claims.map((c) => c.playerId),
          ...result.disqualified.map((d) => d.playerId),
        ])
        for (const id of ids) {
          const rank = playersDump[id]?.search_rank
          if (typeof rank === 'number') sleeperRankById.set(id, rank)
        }
      }
      let slot: number | null = null
      try {
        const orders = await loadSleeperDraftOrders(leagueId)
        const next = orders.find((o) => o.season === nextSeason)
        slot = next?.entries.find((e) => e.sleeperUserId === ownerId)?.slot ?? null
      } catch {
        /* the next draft may not exist yet */
      }
      return { data, result, sleeperRankById, slot }
    })()
      .then((loaded) => {
        if (active) setState({ loading: false, error: null, loaded })
      })
      .catch((err: unknown) => {
        if (active) setState({ loading: false, error: errorMessage(err), loaded: null })
      })
    return () => {
      active = false
    }
  }, [leagueId, season, nextSeason, ownerId, keeperLists])

  const rows = useMemo<KeeperValueRow[]>(() => {
    if (!state.loaded) return []
    const lookup: AdpLookup = {
      manualByName: manual.byName,
      sleeperRankById: state.loaded.sleeperRankById,
    }
    return keeperValueRows(
      claimsForTeam(state.loaded.result, rosterId),
      state.loaded.data.playerInfo,
      teamsCount,
      state.loaded.slot,
      lookup,
    )
  }, [state.loaded, rosterId, teamsCount, manual.byName])

  const columns = useMemo<SortColumn<KeeperValueRow>[]>(
    () => [
      { key: 'player', label: 'Player', get: (r) => r.name },
      {
        key: 'keep',
        label: 'Keep at',
        title: 'Keep round',
        get: (r) => r.keepPick,
        defaultDir: 'asc',
        className: 'num',
      },
      { key: 'adp', label: 'ADP', get: (r) => r.adp, defaultDir: 'asc', className: 'num' },
      { key: 'value', label: 'Value', get: (r) => r.valuePicks, className: 'num' },
    ],
    [],
  )
  const { sort, toggle, sorted } = useSortable(rows, columns)

  if (state.loading)
    return (
      <div className="loading">Working out keeper costs from the {season} draft and rosters…</div>
    )
  if (state.error)
    return <div className="banner error">Could not compute keeper value: {state.error}</div>
  if (!state.loaded) return null

  const teamName = (id: number) =>
    state.loaded?.data.engineInput.teams.find((t) => t.id === id)?.name ?? `Roster ${id}`
  const dqs = state.loaded.result.disqualified.filter((d) =>
    (state.loaded?.data.engineInput.finalRosters[rosterId] ?? []).includes(d.playerId),
  )
  const usingManual = rows.some((r) => r.adpSource === 'manual')
  const usingRank = rows.some((r) => r.adpSource === 'sleeper-rank')

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Players this team could keep for the {nextSeason} draft, the round each costs under the{' '}
        <Link to="/preseason/keepers">league rules</Link>, and the value against ADP. &quot;Keep
        at&quot; is the overall pick that round works out to
        {state.loaded.slot
          ? ` from draft slot ${state.loaded.slot}`
          : ' (draft slot unknown, so mid-round)'}
        . Positive value means the player normally goes earlier than you can keep him.
      </p>
      {rows.length === 0 ? (
        <p className="empty">No eligible keepers on this roster.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <SortableTh key={c.key} column={c} sort={sort} onToggle={toggle} />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={`${r.playerId}:${r.rule}`}>
                  <td>
                    <div className="row" style={{ gap: '0.4rem', flexWrap: 'nowrap' }}>
                      {r.position && (
                        <span className={`pos ${r.position}`} style={{ flex: 'none' }}>
                          {r.position}
                        </span>
                      )}
                      <span>
                        <strong>{r.name}</strong>
                        <div className="muted small">
                          {ruleLabel({ rule: r.rule } as Parameters<typeof ruleLabel>[0])}
                          {r.contingentOnTeamId !== null
                            ? ` · only if ${teamName(r.contingentOnTeamId)} declines`
                            : ''}
                        </div>
                      </span>
                    </div>
                  </td>
                  <td className="num nowrap">
                    R{r.keepRound} <span className="muted small">· pick {r.keepPick}</span>
                  </td>
                  <td className="num nowrap">
                    {r.adp === null ? (
                      <span className="muted">—</span>
                    ) : r.adp % 1 ? (
                      r.adp.toFixed(1)
                    ) : (
                      r.adp
                    )}
                    {r.adpSource === 'sleeper-rank' && (
                      <span className="muted small" title="Sleeper's player rank, not a true ADP">
                        {' '}
                        *
                      </span>
                    )}
                  </td>
                  <td
                    className={`num nowrap ${(r.valuePicks ?? 0) > 0 ? 'success' : (r.valuePicks ?? 0) < 0 ? 'error' : ''}`}
                  >
                    {r.valuePicks === null
                      ? '—'
                      : `${r.valuePicks > 0 ? '+' : ''}${r.valuePicks} picks`}
                    {r.valueRounds !== null && (
                      <div className="muted small">
                        {r.valueRounds > 0 ? '+' : ''}
                        {r.valueRounds} rds
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        {usingManual && manual.def && (
          <>
            ADP from the &quot;{manual.def.label}&quot; stat
            {manual.season ? ` (${manual.season})` : ''} under Stats → Manual stats.{' '}
          </>
        )}
        {usingRank && (
          <>
            * Rows marked with an asterisk use Sleeper&apos;s current player rank as a stand-in for
            ADP
            {isCurrent
              ? ''
              : `, which reflects today's rankings rather than ${nextSeason} draft day`}
            .{' '}
          </>
        )}
        {!manual.def && (
          <>
            For real ADP numbers, {isCommissioner ? 'define' : 'ask the commissioner to define'} a
            stat named &quot;ADP&quot; and paste a {nextSeason} ADP table (player, ADP) under Stats
            → Manual stats; this table picks it up automatically.
          </>
        )}
      </p>
      {dqs.length > 0 && (
        <details className="muted small">
          <summary>{dqs.length} on this roster cannot be kept</summary>
          <ul>
            {dqs.map((d) => (
              <li key={d.playerId}>
                {state.loaded?.data.playerInfo[d.playerId]?.name ?? d.playerId} —{' '}
                {dqLabel[d.reason]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
