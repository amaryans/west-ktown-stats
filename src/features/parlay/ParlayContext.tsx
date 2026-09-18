import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { useAuth } from '../../context/AuthContext.tsx'
import { useLeague, type LeagueValue } from '../../context/LeagueContext.tsx'
import type { Game, GameOdds, Leg, Week } from '../../lib/db.ts'
import { lowestScorer, type LowScorer } from '../../lib/sleeper/league.ts'
import { supabase } from '../../lib/supabase.ts'
import { bestLine, type BoardLine } from './lib/board.ts'

export type LowScoreResult = LowScorer & { profile: LeagueValue['profiles'][number] | null }

export interface ParlayValue {
  loading: boolean
  error: PostgrestError | null
  weeks: Week[]
  legs: Leg[]
  games: Game[]
  reload: () => Promise<void>
  legsForWeek: (weekId: string) => Leg[]
  findWeek: (season: number | string, week: number | string) => Week | null
  /** Lowest scorer for a fantasy week, mapped to an app member when possible. */
  sleeperLowestScorer: (fantasyWeek: number) => Promise<LowScoreResult | null>
  refreshLegOdds: (leg: Leg) => Promise<BoardLine>
  loadOddsForWeek: (season: number, week: number) => Promise<GameOdds[]>
  createWeek: (fields: Partial<Week>) => Promise<void>
  updateWeek: (id: string, fields: Partial<Week>) => Promise<void>
  deleteWeek: (id: string) => Promise<void>
  upsertLeg: (fields: Partial<Leg>) => Promise<void>
  updateLeg: (id: string, fields: Partial<Leg>) => Promise<void>
  deleteLeg: (id: string) => Promise<void>
}

const ParlayContext = createContext<ParlayValue | null>(null)

/** Loads the parlay tables (weeks, legs, games) on top of the shared league context. */
export function ParlayProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { profiles, sleeper } = useLeague()
  const [state, setState] = useState<{
    loading: boolean
    error: PostgrestError | null
    weeks: Week[]
    legs: Leg[]
    games: Game[]
  }>({
    loading: true,
    error: null,
    weeks: [],
    legs: [],
    games: [],
  })

  const reload = useCallback(async () => {
    if (!user) return
    const [weeks, legs, games] = await Promise.all([
      supabase
        .from('weeks')
        .select('*')
        .order('season', { ascending: false })
        .order('week', { ascending: false }),
      supabase.from('legs').select('*').order('created_at'),
      supabase.from('games').select('*').order('commence_time'),
    ])
    const failed = [weeks, legs, games].find((r) => r.error)
    if (failed?.error) {
      setState((s) => ({ ...s, loading: false, error: failed.error }))
      return
    }
    setState({
      loading: false,
      error: null,
      weeks: (weeks.data ?? []) as Week[],
      legs: (legs.data ?? []) as Leg[],
      games: (games.data ?? []) as Game[],
    })
  }, [user])

  useEffect(() => {
    if (user) void reload()
  }, [user, reload])

  const legsForWeek = useCallback(
    (weekId: string) => state.legs.filter((l) => l.week_id === weekId),
    [state.legs],
  )
  const findWeek = useCallback(
    (season: number | string, week: number | string) =>
      state.weeks.find((w) => w.season === Number(season) && w.week === Number(week)) ?? null,
    [state.weeks],
  )

  const sleeperLowestScorer = useCallback(
    async (fantasyWeek: number): Promise<LowScoreResult | null> => {
      const league = sleeper.data
      if (!league) return null
      const low = await lowestScorer(league.leagueId, fantasyWeek, league.teams)
      if (!low) return null
      const profile = profiles.find((p) => p.sleeper_user_id === low.userId) ?? null
      return { ...low, profile }
    },
    [sleeper.data, profiles],
  )

  async function run(query: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
    const { error } = await query
    if (error) throw error
    await reload()
  }
  const uid = user?.id ?? ''

  const api = useMemo(
    () => ({
      createWeek: (fields: Partial<Week>) =>
        run(supabase.from('weeks').insert({ ...fields, created_by: uid })),
      updateWeek: (id: string, fields: Partial<Week>) =>
        run(supabase.from('weeks').update(fields).eq('id', id)),
      deleteWeek: (id: string) => run(supabase.from('weeks').delete().eq('id', id)),
      upsertLeg: (fields: Partial<Leg>) =>
        run(
          supabase
            .from('legs')
            .upsert({ ...fields, entered_by: uid }, { onConflict: 'week_id,user_id' }),
        ),
      updateLeg: (id: string, fields: Partial<Leg>) =>
        run(supabase.from('legs').update(fields).eq('id', id)),
      deleteLeg: (id: string) => run(supabase.from('legs').delete().eq('id', id)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, reload],
  )

  /** Re-price a leg that came from the odds board against the latest lines. */
  async function refreshLegOdds(leg: Leg): Promise<BoardLine> {
    if (!leg.game_id || !leg.odds_ref)
      throw new Error('This leg was typed in by hand, so there is no line to refresh.')
    const { data, error } = await supabase.from('game_odds').select('*').eq('game_id', leg.game_id)
    if (error) throw error
    const { market, outcome, point } = leg.odds_ref
    const line = bestLine(
      (data ?? []) as GameOdds[],
      market,
      outcome,
      market === 'h2h' ? undefined : point,
    )
    if (line.price === null)
      throw new Error('No book is offering that exact line any more. Update the odds by hand.')
    if (line.price !== leg.odds) await api.updateLeg(leg.id, { odds: line.price })
    return line
  }

  /** Odds rows can exceed Supabase's 1000-row page, so page through them. */
  async function loadOddsForWeek(season: number, week: number): Promise<GameOdds[]> {
    const gameIds = state.games
      .filter((g) => g.season === season && g.week === week)
      .map((g) => g.id)
    if (!gameIds.length) return []
    const rows: GameOdds[] = []
    const page = 1000
    for (let from = 0; ; from += page) {
      const { data, error } = await supabase
        .from('game_odds')
        .select('*')
        .in('game_id', gameIds)
        .order('id')
        .range(from, from + page - 1)
      if (error) throw error
      rows.push(...((data ?? []) as GameOdds[]))
      if (!data || data.length < page) break
    }
    return rows
  }

  const value: ParlayValue = {
    ...state,
    reload,
    legsForWeek,
    findWeek,
    sleeperLowestScorer,
    refreshLegOdds,
    loadOddsForWeek,
    ...api,
  }
  return <ParlayContext.Provider value={value}>{children}</ParlayContext.Provider>
}

export function useParlay(): ParlayValue {
  const value = useContext(ParlayContext)
  if (!value) throw new Error('useParlay must be used inside ParlayProvider')
  return value
}
