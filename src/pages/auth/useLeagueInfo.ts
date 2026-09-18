import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.ts'

export interface PublicLeagueInfo {
  league_name: string
  season: number | null
  sleeper_league_id: string | null
}

/** League name + Sleeper id readable before login (for the auth screens). */
export function useLeagueInfo(): PublicLeagueInfo {
  const [info, setInfo] = useState<PublicLeagueInfo>({
    league_name: 'West K-Town Fantasy Football',
    season: null,
    sleeper_league_id: null,
  })
  useEffect(() => {
    supabase.rpc('public_league_info').then(({ data }) => {
      const row = (data as PublicLeagueInfo[] | null)?.[0]
      if (row?.league_name) setInfo(row)
    })
  }, [])
  return info
}
