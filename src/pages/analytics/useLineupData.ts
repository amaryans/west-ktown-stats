import { useEffect, useState } from 'react'
import { errorMessage } from '../../context/LeagueContext.tsx'
import { loadLineupSeasons, type LineupSeason } from '../../features/analytics/lineupLoader.ts'
import { loadSeasonMoves } from '../../features/analytics/movesLoader.ts'
import type { Move } from '../../features/analytics/transactions.ts'
import type { LeagueHistory } from '../../features/standings/history.ts'
import { loadPlayers, playerName, type PlayersDump } from '../../lib/players.ts'

export interface LineupData {
  seasons: LineupSeason[]
  players: PlayersDump
  positionsOf: (playerId: string) => string[]
  primaryPosition: (playerId: string) => string | null
  name: (playerId: string) => string
}

// One load per history object, shared by the Execution and Positions tabs.
let shared: { history: LeagueHistory; promise: Promise<LineupData> } | null = null

function load(history: LeagueHistory, onProgress: (m: string) => void): Promise<LineupData> {
  if (shared?.history === history) return shared.promise
  const promise = Promise.all([loadLineupSeasons(history, onProgress), loadPlayers()]).then(
    ([seasons, players]): LineupData => ({
      seasons,
      players,
      positionsOf: (id) => {
        const p = players[id]
        if (!p) return []
        if (p.fantasy_positions?.length) return p.fantasy_positions
        return p.position ? [p.position] : []
      },
      primaryPosition: (id) => players[id]?.position ?? players[id]?.fantasy_positions?.[0] ?? null,
      name: (id) => playerName(players[id], id),
    }),
  )
  shared = { history, promise }
  promise.catch(() => {
    if (shared?.promise === promise) shared = null
  })
  return promise
}

export function useLineupData(history: LeagueHistory) {
  const [state, setState] = useState<{
    data: LineupData | null
    progress: string | null
    error: string | null
  }>({ data: null, progress: 'Reading lineups…', error: null })

  useEffect(() => {
    let active = true
    load(history, (progress) => {
      if (active) setState((s) => (s.data ? s : { ...s, progress }))
    })
      .then((data) => {
        if (active) setState({ data, progress: null, error: null })
      })
      .catch((err: unknown) => {
        if (active) setState({ data: null, progress: null, error: errorMessage(err) })
      })
    return () => {
      active = false
    }
  }, [history])

  return state
}

export interface MovesData extends LineupData {
  moves: Map<string, Move[]>
}

let sharedMoves: { history: LeagueHistory; promise: Promise<MovesData> } | null = null

function loadMoves(history: LeagueHistory, onProgress: (m: string) => void): Promise<MovesData> {
  if (sharedMoves?.history === history) return sharedMoves.promise
  const promise = load(history, onProgress).then(async (data) => {
    const seasons = await loadSeasonMoves(data.seasons, onProgress)
    return { ...data, moves: new Map(seasons.map((s) => [s.leagueId, s.moves])) }
  })
  sharedMoves = { history, promise }
  promise.catch(() => {
    if (sharedMoves?.promise === promise) sharedMoves = null
  })
  return promise
}

/** Lineup data plus every season's transactions (trades, waivers, report card). */
export function useMovesData(history: LeagueHistory) {
  const [state, setState] = useState<{
    data: MovesData | null
    progress: string | null
    error: string | null
  }>({ data: null, progress: 'Reading transactions…', error: null })

  useEffect(() => {
    let active = true
    loadMoves(history, (progress) => {
      if (active) setState((s) => (s.data ? s : { ...s, progress }))
    })
      .then((data) => {
        if (active) setState({ data, progress: null, error: null })
      })
      .catch((err: unknown) => {
        if (active) setState({ data: null, progress: null, error: errorMessage(err) })
      })
    return () => {
      active = false
    }
  }, [history])

  return state
}
