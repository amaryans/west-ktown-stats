import { useMemo } from 'react'
import type { AssembledData } from '../api'
import type { EligibilityResult, KeeperClaim, TeamId } from '../engine'
import { claimsForTeam } from '../engine'
import { conflictText } from '../lib/export'
import { costLabel, dqLabel, playerLabel, ruleLabel } from '../lib/format'
import { teamSelectionResult, type Selections } from '../lib/selection'

function ClaimRow(props: {
  data: AssembledData
  claim: KeeperClaim
  selected: boolean
  onToggle: () => void
}) {
  const { data, claim } = props
  const contingentTeam =
    claim.contingentOnDeclineBy === undefined
      ? undefined
      : (data.engineInput.teams.find((team) => team.id === claim.contingentOnDeclineBy)?.name ??
        `Roster ${claim.contingentOnDeclineBy}`)
  return (
    <li>
      <label className="claim">
        <input type="checkbox" checked={props.selected} onChange={props.onToggle} />
        <span className={`cost ${claim.cost.kind}`}>{costLabel(claim.cost)}</span>
        <span className="name">{playerLabel(claim.playerId, data.playerInfo[claim.playerId])}</span>
        <span className="basis">{ruleLabel(claim)}</span>
        {contingentTeam !== undefined && (
          <span className="contingent">if {contingentTeam} declines</span>
        )}
      </label>
    </li>
  )
}

export function TeamBoard(props: {
  data: AssembledData
  result: EligibilityResult
  teamId: TeamId
  selections: Selections
  onToggle: (teamId: TeamId, playerId: string) => void
}) {
  const { data, result, teamId } = props
  const team = data.engineInput.teams.find((entry) => entry.id === teamId)
  const claims = useMemo(() => claimsForTeam(result, teamId), [result, teamId])
  const selection = useMemo(
    () => teamSelectionResult(result, props.selections, teamId),
    [result, props.selections, teamId],
  )
  const selectedSet = useMemo(
    () => new Set(props.selections[teamId] ?? []),
    [props.selections, teamId],
  )

  const groups = useMemo(() => {
    const own = claims
      .filter((claim) => claim.rule === '3.1.1')
      .sort((a, b) =>
        a.cost.kind === 'draft-position' && b.cost.kind === 'draft-position'
          ? a.cost.round - b.cost.round
          : 0,
      )
    return {
      own,
      roster: claims.filter((claim) => claim.rule === '3.1.2'),
      reclaims: claims.filter((claim) => claim.rule === '3.2.2' || claim.rule === '3.2.3'),
    }
  }, [claims])

  const teamDqs = useMemo(() => {
    const roster = new Set(data.engineInput.finalRosters[teamId] ?? [])
    const draftedHere = new Set(
      data.engineInput.draftPicks
        .filter((pick) => pick.teamId === teamId)
        .map((pick) => pick.playerId),
    )
    return result.disqualified.filter(
      (dq) => roster.has(dq.playerId) || draftedHere.has(dq.playerId),
    )
  }, [data, result, teamId])

  const renderGroup = (title: string, groupClaims: KeeperClaim[]) =>
    groupClaims.length > 0 && (
      <section>
        <h4>{title}</h4>
        <ul className="claims">
          {groupClaims.map((claim) => (
            <ClaimRow
              key={`${claim.playerId}:${claim.rule}`}
              data={data}
              claim={claim}
              selected={selectedSet.has(claim.playerId)}
              onToggle={() => props.onToggle(teamId, claim.playerId)}
            />
          ))}
        </ul>
      </section>
    )

  return (
    <article className="card">
      <h3>{team?.name ?? `Roster ${teamId}`}</h3>

      {selection.chosen.length > 0 && (
        <div className={selection.conflicts.length > 0 ? 'selection warn' : 'selection'}>
          <strong>Selected {selection.chosen.length}/2:</strong>
          <ul>
            {selection.assignments.map((assignment) => (
              <li key={assignment.playerId}>
                Round {assignment.round} —{' '}
                {playerLabel(assignment.playerId, data.playerInfo[assignment.playerId])}
              </li>
            ))}
            {selection.conflicts.map((conflict, index) => (
              <li key={index} className="conflict">
                ⚠ {conflictText(data, conflict)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {claims.length === 0 && <p className="empty">No eligible keepers.</p>}
      {renderGroup('Keep at draft position', groups.own)}
      {renderGroup('Keep at R5 (or R6)', groups.roster)}
      {renderGroup('Reclaims', groups.reclaims)}

      {teamDqs.length > 0 && (
        <details className="dq">
          <summary>{teamDqs.length} disqualified</summary>
          <ul>
            {teamDqs.map((dq) => (
              <li key={dq.playerId}>
                {playerLabel(dq.playerId, data.playerInfo[dq.playerId])} — {dqLabel[dq.reason]}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}
