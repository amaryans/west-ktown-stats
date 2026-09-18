import type { Cost, DisqualificationReason, KeeperClaim } from '../engine'
import type { PlayerInfo } from '../api'

export const costLabel = (cost: Cost): string =>
  cost.kind === 'draft-position' ? `R${cost.round}` : 'R5→R6'

export const ruleLabel = (claim: KeeperClaim): string => {
  switch (claim.rule) {
    case '3.1.1':
      return 'your draft pick'
    case '3.1.2':
      return 'on your final roster'
    case '3.2.2':
      return 'reclaim if declined'
    case '3.2.3':
      return 'free-agent reclaim'
  }
}

export const dqLabel: Record<DisqualificationReason, string> = {
  'kept-last-season': 'kept last season (Rule 1.1)',
  'drafted-rounds-1-4': 'drafted in rounds 1–4 (Rule 1.2)',
}

export const playerLabel = (playerId: string, info?: PlayerInfo): string => {
  if (info === undefined) return playerId
  const position = info.position ? ` (${info.position})` : ''
  return `${info.name}${position}`
}
