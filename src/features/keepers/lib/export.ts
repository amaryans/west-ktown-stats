import type { AssembledData } from '../api'
import type { EligibilityResult, TeamId } from '../engine'
import { claimsForTeam } from '../engine'
import { costLabel, dqLabel, playerLabel, ruleLabel } from './format'
import { teamSelectionResult, type Selections } from './selection'

const teamName = (data: AssembledData, teamId: TeamId): string =>
  data.engineInput.teams.find((team) => team.id === teamId)?.name ?? `Roster ${teamId}`

/** Full board (plus current selections, when any) as shareable Markdown. */
export function boardMarkdown(
  data: AssembledData,
  result: EligibilityResult,
  selections: Selections = {},
): string {
  const lines: string[] = [
    `# ${data.previousLeague.name} — ${data.upcomingSeason} keeper options`,
    '',
    `Based on the ${data.previousLeague.season} season. Costs: R5→R6 means round 5, or round 6 if round 5 is occupied.`,
  ]

  for (const team of data.engineInput.teams) {
    lines.push(
      '',
      `## ${team.name}`,
      '',
      '| Player | Cost | Basis | Notes |',
      '| --- | --- | --- | --- |',
    )
    const claims = claimsForTeam(result, team.id)
    if (claims.length === 0) lines.push('| _no eligible keepers_ | | | |')
    for (const claim of claims) {
      const note =
        claim.contingentOnDeclineBy === undefined
          ? ''
          : `only if ${teamName(data, claim.contingentOnDeclineBy)} declines`
      lines.push(
        `| ${playerLabel(claim.playerId, data.playerInfo[claim.playerId])} | ${costLabel(claim.cost)} | ${ruleLabel(claim)} | ${note} |`,
      )
    }

    const selection = teamSelectionResult(result, selections, team.id)
    if (selection.chosen.length > 0) {
      lines.push('', '**Selected keepers:**')
      for (const assignment of selection.assignments) {
        lines.push(
          `- Round ${assignment.round}: ${playerLabel(assignment.playerId, data.playerInfo[assignment.playerId])}`,
        )
      }
      for (const conflict of selection.conflicts) {
        lines.push(`- ⚠️ ${conflictText(data, conflict)}`)
      }
    }
  }

  lines.push('', '## Disqualified', '')
  for (const dq of result.disqualified) {
    lines.push(
      `- ${playerLabel(dq.playerId, data.playerInfo[dq.playerId])} — ${dqLabel[dq.reason]}`,
    )
  }
  return lines.join('\n')
}

export function conflictText(
  data: AssembledData,
  conflict: ReturnType<typeof teamSelectionResult>['conflicts'][number],
): string {
  switch (conflict.kind) {
    case 'over-max-keepers':
      return `${conflict.selected} selected, but the league cap is ${conflict.limit} keepers.`
    case 'duplicate-draft-round':
      return `Round ${conflict.round} has multiple draft-position keepers (${conflict.playerIds
        .map((id) => playerLabel(id, data.playerInfo[id]))
        .join(', ')}) — keep only one.`
    case 'no-default-round-available':
      return `${playerLabel(conflict.playerId, data.playerInfo[conflict.playerId])} needs a default round, but rounds ${conflict.occupiedRounds.join(' and ')} are taken.`
    case 'claim-blocked':
      return `${playerLabel(conflict.playerId, data.playerInfo[conflict.playerId])} is being kept by ${teamName(data, conflict.keptBy)} — the reclaim is off.`
  }
}

const csvEscape = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value

/** One row per claim plus one per disqualification — spreadsheet-friendly. */
export function boardCsv(data: AssembledData, result: EligibilityResult): string {
  const rows: string[][] = [
    ['team', 'player', 'position', 'status', 'cost', 'basis', 'contingent_on'],
  ]
  for (const claim of result.claims) {
    const info = data.playerInfo[claim.playerId]
    rows.push([
      teamName(data, claim.teamId),
      info?.name ?? claim.playerId,
      info?.position ?? '',
      'eligible',
      costLabel(claim.cost),
      ruleLabel(claim),
      claim.contingentOnDeclineBy === undefined ? '' : teamName(data, claim.contingentOnDeclineBy),
    ])
  }
  for (const dq of result.disqualified) {
    const info = data.playerInfo[dq.playerId]
    rows.push(['', info?.name ?? dq.playerId, info?.position ?? '', dqLabel[dq.reason], '', '', ''])
  }
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
}
