import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings, DraftSlotAssignment, League, Team } from '../data/types.ts'
import { buildLotteryConfig } from '../data/lotteryConfig.ts'
import { runLottery } from '../engine/lottery.ts'
import type { LotteryConfig, LotteryResult } from '../engine/types.ts'

export type AppPhase = 'setup' | 'review' | 'config' | 'simulation' | 'event' | 'results'

const STORAGE_KEY = 'ffl.v1'

const DEFAULT_SETTINGS: AppSettings = {
  orderingSource: 'regularSeason',
  slotMode: 'winnerChoosesSlot',
  customOddsBps: null,
  pickFloors: null,
}

interface AppState {
  phase: AppPhase
  league: League | null
  settings: AppSettings
  /** Frozen at Start Lottery: seeded teams + odds the result was drawn from. */
  lotteryConfig: LotteryConfig | null
  result: LotteryResult | null
  /** Number of picks revealed so far (reveals run pick 1 -> pick N). */
  revealCursor: number
  slotAssignments: DraftSlotAssignment[]

  setLeague: (league: League) => void
  updateLeagueName: (name: string) => void
  updateTeam: (teamId: string, patch: Partial<Omit<Team, 'id'>>) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  goToPhase: (phase: AppPhase) => void
  startLottery: () => void
  revealNext: () => void
  assignSlot: (teamId: string, slot: number) => void
  undoSlotAssignment: () => void
  finishEvent: () => void
  startOver: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      phase: 'setup',
      league: null,
      settings: DEFAULT_SETTINGS,
      lotteryConfig: null,
      result: null,
      revealCursor: 0,
      slotAssignments: [],

      setLeague: (league) => set({ league, phase: 'review' }),

      updateLeagueName: (name) =>
        set((state) => (state.league ? { league: { ...state.league, name } } : {})),

      updateTeam: (teamId, patch) =>
        set((state) =>
          state.league
            ? {
                league: {
                  ...state.league,
                  teams: state.league.teams.map((team) =>
                    team.id === teamId ? { ...team, ...patch } : team,
                  ),
                },
              }
            : {},
        ),

      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

      goToPhase: (phase) => set({ phase }),

      startLottery: () => {
        const { league, settings } = get()
        if (!league) {
          throw new Error('Cannot start the lottery without a league')
        }
        const config: LotteryConfig = buildLotteryConfig(league, settings)
        const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
        const result = runLottery(config, seed, new Date().toISOString())
        set({
          lotteryConfig: config,
          result,
          revealCursor: 0,
          slotAssignments: [],
          phase: 'event',
        })
      },

      revealNext: () =>
        set((state) => {
          const total = state.result?.pickOrder.length ?? 0
          return state.revealCursor < total ? { revealCursor: state.revealCursor + 1 } : {}
        }),

      assignSlot: (teamId, slot) =>
        set((state) => {
          const total = state.result?.pickOrder.length ?? 0
          const isSlotTaken = state.slotAssignments.some((a) => a.slot === slot)
          const isTeamAssigned = state.slotAssignments.some((a) => a.teamId === teamId)
          if (slot < 1 || slot > total || isSlotTaken || isTeamAssigned) {
            return {}
          }
          return { slotAssignments: [...state.slotAssignments, { teamId, slot }] }
        }),

      undoSlotAssignment: () =>
        set((state) => ({ slotAssignments: state.slotAssignments.slice(0, -1) })),

      finishEvent: () => set({ phase: 'results' }),

      startOver: () =>
        set({
          phase: 'setup',
          league: null,
          settings: DEFAULT_SETTINGS,
          lotteryConfig: null,
          result: null,
          revealCursor: 0,
          slotAssignments: [],
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      // Defensive rehydration: older or corrupted persisted snapshots merge on
      // top of complete defaults so a bad localStorage entry can never leave
      // the app with missing fields (and a blank screen).
      merge: (persisted, current) => {
        if (persisted === null || typeof persisted !== 'object') {
          return current
        }
        const snapshot = persisted as Partial<AppState>
        return {
          ...current,
          ...snapshot,
          settings: { ...DEFAULT_SETTINGS, ...(snapshot.settings ?? {}) },
        }
      },
    },
  ),
)

/** Team ids in the order they get revealed: pick 1 first, so the #1 winner claims a slot first. */
export function revealedTeamIds(state: Pick<AppState, 'result' | 'revealCursor'>): string[] {
  if (!state.result) {
    return []
  }
  return state.result.pickOrder.slice(0, state.revealCursor)
}

/**
 * The final draft order (index 0 = slot 1), or null while incomplete.
 * In lotteryIsOrder mode this is simply the pick order; in winnerChoosesSlot
 * mode it's assembled from each winner's chosen slot.
 */
export function finalDraftOrder(
  state: Pick<AppState, 'result' | 'slotAssignments' | 'settings' | 'league'>,
): Team[] | null {
  const { result, league } = state
  if (!result || !league) {
    return null
  }
  const teamsById = new Map(league.teams.map((team) => [team.id, team]))
  if (state.settings.slotMode === 'lotteryIsOrder') {
    const order = result.pickOrder.map((id) => teamsById.get(id))
    return order.every((team): team is Team => team !== undefined) ? order : null
  }
  if (state.slotAssignments.length !== result.pickOrder.length) {
    return null
  }
  const bySlot = [...state.slotAssignments].sort((a, b) => a.slot - b.slot)
  const order = bySlot.map((assignment) => teamsById.get(assignment.teamId))
  return order.every((team): team is Team => team !== undefined) ? order : null
}
