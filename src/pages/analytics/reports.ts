import { useMemo } from 'react'
import { seasonReport, type SeasonReport } from '../../features/analytics/seasonReport.ts'
import type { SeasonStandings } from '../../features/standings/history.ts'
import type { MovesData } from './useLineupData.ts'

/** Season reports for every season with player-level data, keyed by league id. */
export function useReports(data: MovesData, seasons: SeasonStandings[]): Map<string, SeasonReport> {
  return useMemo(() => {
    const out = new Map<string, SeasonReport>()
    for (const s of seasons) {
      const lineup = data.seasons.find((l) => l.leagueId === s.leagueId)
      if (!lineup) continue
      out.set(s.leagueId, seasonReport(s, lineup, data.moves.get(s.leagueId) ?? [], data))
    }
    return out
  }, [data, seasons])
}
