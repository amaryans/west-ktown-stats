import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase.ts'
import type {
  DraftOrder,
  KeeperList,
  LeagueSettings,
  Profile,
  StatDefinition,
  StatEntry,
  StatSuggestion,
} from '../lib/db.ts'
import { loadSleeperLeague, type SleeperLeagueInfo } from '../lib/sleeper/league.ts'
import { loadHistory, type LeagueHistory } from '../features/standings/history.ts'
import { useAuth } from './AuthContext.tsx'

interface DataState {
  loading: boolean
  error: PostgrestError | null
  settings: LeagueSettings | null
  profiles: Profile[]
  draftOrders: DraftOrder[]
  keeperLists: KeeperList[]
  suggestions: StatSuggestion[]
  statDefinitions: StatDefinition[]
  statEntries: StatEntry[]
}

export interface AsyncResource<T> {
  loading: boolean
  error: string | null
  data: T | null
  /** Progress text while loading (Sleeper history walks several seasons). */
  progress: string | null
}

export interface LeagueValue extends DataState {
  me: Profile | null
  isCommissioner: boolean
  /** The current Sleeper season for settings.sleeper_league_id. */
  sleeper: AsyncResource<SleeperLeagueInfo>
  /** Every season's standings, loaded lazily on first use (`history.load()`). */
  history: AsyncResource<LeagueHistory> & { load: () => void; refresh: () => void }
  reload: () => Promise<void>
  profileById: (id: string | null | undefined) => Profile | null
  nameOf: (id: string | null | undefined) => string
  updateSettings: (fields: Partial<LeagueSettings>) => Promise<void>
  updateProfile: (fields: Partial<Profile>) => Promise<void>
  updateMember: (id: string, fields: Partial<Profile>) => Promise<void>
  upsertDraftOrder: (
    fields: Omit<DraftOrder, 'id' | 'created_by' | 'created_at' | 'updated_at'>,
  ) => Promise<void>
  deleteDraftOrder: (id: string) => Promise<void>
  upsertKeeperList: (
    fields: Pick<KeeperList, 'season' | 'sleeper_league_id' | 'player_ids'>,
  ) => Promise<void>
  createSuggestion: (fields: Pick<StatSuggestion, 'title' | 'description'>) => Promise<void>
  updateSuggestion: (id: string, fields: Partial<StatSuggestion>) => Promise<void>
  deleteSuggestion: (id: string) => Promise<void>
  createStatDefinition: (
    fields: Pick<StatDefinition, 'key' | 'label' | 'description' | 'unit' | 'scope'>,
  ) => Promise<void>
  updateStatDefinition: (id: string, fields: Partial<StatDefinition>) => Promise<void>
  deleteStatDefinition: (id: string) => Promise<void>
  upsertStatEntries: (
    rows: Omit<StatEntry, 'id' | 'entered_by' | 'created_at' | 'updated_at'>[],
  ) => Promise<void>
  updateStatEntry: (id: string, fields: Partial<StatEntry>) => Promise<void>
  deleteStatEntry: (id: string) => Promise<void>
}

const LeagueContext = createContext<LeagueValue | null>(null)

const EMPTY: DataState = {
  loading: true,
  error: null,
  settings: null,
  profiles: [],
  draftOrders: [],
  keeperLists: [],
  suggestions: [],
  statDefinitions: [],
  statEntries: [],
}

// Loads the whole league dataset (it is tiny: a dozen members and a few
// hundred rows) and exposes the mutations every page needs. Pages call the
// mutation helpers, which reload after writing.
export function LeagueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, setState] = useState<DataState>(EMPTY)

  const reload = useCallback(async () => {
    if (!user) return
    const [
      settings,
      profiles,
      draftOrders,
      keeperLists,
      suggestions,
      statDefinitions,
      statEntries,
    ] = await Promise.all([
      supabase.from('league_settings').select('*').eq('id', 1).single(),
      supabase.from('profiles').select('*').order('display_name'),
      supabase.from('draft_orders').select('*').order('season', { ascending: false }),
      supabase.from('keeper_lists').select('*').order('season', { ascending: false }),
      supabase.from('stat_suggestions').select('*').order('created_at', { ascending: false }),
      supabase.from('stat_definitions').select('*').order('label'),
      supabase
        .from('stat_entries')
        .select('*')
        .order('season', { ascending: false })
        .order('week', { ascending: false })
        .order('value', { ascending: false }),
    ])
    const failed = [
      settings,
      profiles,
      draftOrders,
      keeperLists,
      suggestions,
      statDefinitions,
      statEntries,
    ].find((r) => r.error)
    if (failed?.error) {
      setState((s) => ({ ...s, loading: false, error: failed.error }))
      return
    }
    setState({
      loading: false,
      error: null,
      settings: settings.data as LeagueSettings,
      profiles: (profiles.data ?? []) as Profile[],
      draftOrders: (draftOrders.data ?? []) as DraftOrder[],
      keeperLists: (keeperLists.data ?? []) as KeeperList[],
      suggestions: (suggestions.data ?? []) as StatSuggestion[],
      statDefinitions: (statDefinitions.data ?? []) as StatDefinition[],
      statEntries: (statEntries.data ?? []) as StatEntry[],
    })
  }, [user])

  useEffect(() => {
    if (user) void reload()
  }, [user, reload])

  const me = useMemo(
    () => state.profiles.find((p) => p.id === user?.id) ?? null,
    [state.profiles, user],
  )
  const isCommissioner = Boolean(me?.is_commissioner)

  // ---- Sleeper: current season ------------------------------------------
  const sleeperLeagueId = state.settings?.sleeper_league_id || null
  const [sleeper, setSleeper] = useState<AsyncResource<SleeperLeagueInfo>>({
    loading: false,
    error: null,
    data: null,
    progress: null,
  })
  useEffect(() => {
    if (!sleeperLeagueId) {
      setSleeper({ loading: false, error: null, data: null, progress: null })
      return
    }
    let active = true
    setSleeper({ loading: true, error: null, data: null, progress: null })
    loadSleeperLeague(sleeperLeagueId)
      .then((data) => {
        if (active) setSleeper({ loading: false, error: null, data, progress: null })
      })
      .catch((err: unknown) => {
        if (active)
          setSleeper({ loading: false, error: errorMessage(err), data: null, progress: null })
      })
    return () => {
      active = false
    }
  }, [sleeperLeagueId])

  // ---- Sleeper: full history (lazy) -------------------------------------
  const [history, setHistory] = useState<AsyncResource<LeagueHistory>>({
    loading: false,
    error: null,
    data: null,
    progress: null,
  })
  const historyRequested = useRef<string | null>(null)
  const runHistory = useCallback((leagueId: string) => {
    historyRequested.current = leagueId
    setHistory({ loading: true, error: null, data: null, progress: 'Loading…' })
    loadHistory(leagueId, (progress) =>
      setHistory((h) => (historyRequested.current === leagueId ? { ...h, progress } : h)),
    )
      .then((data) => {
        if (historyRequested.current === leagueId)
          setHistory({ loading: false, error: null, data, progress: null })
      })
      .catch((err: unknown) => {
        if (historyRequested.current === leagueId)
          setHistory({ loading: false, error: errorMessage(err), data: null, progress: null })
      })
  }, [])
  const loadHistoryOnce = useCallback(() => {
    if (!sleeperLeagueId || historyRequested.current === sleeperLeagueId) return
    runHistory(sleeperLeagueId)
  }, [sleeperLeagueId, runHistory])
  const refreshHistory = useCallback(() => {
    if (sleeperLeagueId) runHistory(sleeperLeagueId)
  }, [sleeperLeagueId, runHistory])
  useEffect(() => {
    // A new league id invalidates whatever history was loaded before.
    if (historyRequested.current && historyRequested.current !== sleeperLeagueId) {
      historyRequested.current = null
      setHistory({ loading: false, error: null, data: null, progress: null })
    }
  }, [sleeperLeagueId])

  const profileById = useCallback(
    (id: string | null | undefined) => state.profiles.find((p) => p.id === id) ?? null,
    [state.profiles],
  )
  const nameOf = useCallback(
    (id: string | null | undefined) => profileById(id)?.display_name ?? 'Unknown',
    [profileById],
  )

  // ---- mutations ---------------------------------------------------------
  async function run(query: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
    const { error } = await query
    if (error) throw error
    await reload()
  }
  const uid = user?.id ?? ''

  const value: LeagueValue = {
    ...state,
    me,
    isCommissioner,
    sleeper,
    history: { ...history, load: loadHistoryOnce, refresh: refreshHistory },
    reload,
    profileById,
    nameOf,
    updateSettings: (fields) => run(supabase.from('league_settings').update(fields).eq('id', 1)),
    updateProfile: (fields) => run(supabase.from('profiles').update(fields).eq('id', uid)),
    // Commissioner only (RLS enforces it): edit any member's profile.
    updateMember: (id, fields) => run(supabase.from('profiles').update(fields).eq('id', id)),
    upsertDraftOrder: (fields) =>
      run(
        supabase
          .from('draft_orders')
          .upsert({ ...fields, created_by: uid }, { onConflict: 'season' }),
      ),
    deleteDraftOrder: (id) => run(supabase.from('draft_orders').delete().eq('id', id)),
    upsertKeeperList: (fields) =>
      run(
        supabase
          .from('keeper_lists')
          .upsert({ ...fields, updated_by: uid }, { onConflict: 'season' }),
      ),
    createSuggestion: (fields) =>
      run(supabase.from('stat_suggestions').insert({ ...fields, user_id: uid })),
    updateSuggestion: (id, fields) =>
      run(supabase.from('stat_suggestions').update(fields).eq('id', id)),
    deleteSuggestion: (id) => run(supabase.from('stat_suggestions').delete().eq('id', id)),
    createStatDefinition: (fields) =>
      run(supabase.from('stat_definitions').insert({ ...fields, created_by: uid })),
    updateStatDefinition: (id, fields) =>
      run(supabase.from('stat_definitions').update(fields).eq('id', id)),
    deleteStatDefinition: (id) => run(supabase.from('stat_definitions').delete().eq('id', id)),
    upsertStatEntries: (rows) =>
      run(
        supabase.from('stat_entries').upsert(
          rows.map((r) => ({ ...r, entered_by: uid })),
          { onConflict: 'definition_id,season,week,subject' },
        ),
      ),
    updateStatEntry: (id, fields) => run(supabase.from('stat_entries').update(fields).eq('id', id)),
    deleteStatEntry: (id) => run(supabase.from('stat_entries').delete().eq('id', id)),
  }
  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>
}

export function useLeague(): LeagueValue {
  const value = useContext(LeagueContext)
  if (!value) throw new Error('useLeague must be used inside LeagueProvider')
  return value
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err && 'message' in err)
    return String((err as { message: unknown }).message)
  return String(err)
}
