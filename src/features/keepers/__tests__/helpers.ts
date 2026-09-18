import type { EngineInput, Team } from '../engine'

export const team = (id: number): Team => ({ id, name: `Team ${id}`, ownerId: `user_${id}` })

export function makeInput(partial: Partial<EngineInput>): EngineInput {
  return {
    teams: partial.teams ?? [team(1), team(2)],
    draftPicks: partial.draftPicks ?? [],
    finalRosters: partial.finalRosters ?? {},
    previousKeepers: partial.previousKeepers ?? new Set(),
  }
}
