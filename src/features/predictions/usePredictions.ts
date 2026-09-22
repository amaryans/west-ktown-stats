import { useCallback, useEffect, useMemo, useState } from 'react'
import { errorMessage } from '../../context/LeagueContext.tsx'
import { simulateSeason, type SimulationResult } from './engine/index.ts'
import { loadPredictionData, simulationInput, type PredictionData } from './loader.ts'

export const SIMULATION_RUNS = 10_000
/** Fixed so the same data always shows the same odds. */
export const SIMULATION_SEED = 0x57_4b_54 // "WKT"

export interface PredictionState {
  loading: boolean
  progress: string | null
  error: string | null
  data: PredictionData | null
  result: SimulationResult | null
  refresh: () => void
}

/** Loads the season's prediction data for a league and runs the simulation over it. */
export function usePredictions(leagueId: string | null): PredictionState {
  const [state, setState] = useState<Omit<PredictionState, 'result' | 'refresh'>>({
    loading: false,
    progress: null,
    error: null,
    data: null,
  })
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!leagueId) {
      setState({ loading: false, progress: null, error: null, data: null })
      return
    }
    let active = true
    setState({ loading: true, progress: 'Loading…', error: null, data: null })
    loadPredictionData(leagueId, (progress) => {
      if (active) setState((s) => ({ ...s, progress }))
    })
      .then((data) => {
        if (active) setState({ loading: false, progress: null, error: null, data })
      })
      .catch((err: unknown) => {
        if (active)
          setState({ loading: false, progress: null, error: errorMessage(err), data: null })
      })
    return () => {
      active = false
    }
  }, [leagueId, generation])

  const result = useMemo(
    () =>
      state.data
        ? simulateSeason(simulationInput(state.data, SIMULATION_RUNS, SIMULATION_SEED))
        : null,
    [state.data],
  )
  const refresh = useCallback(() => setGeneration((g) => g + 1), [])
  return { ...state, result, refresh }
}
