import { useAppStore, type AppPhase } from './state/store.ts'
import type { PosterEntry } from './components/results/ResultsPoster.tsx'
import SetupScreen from './screens/SetupScreen.tsx'
import LeagueReviewScreen from './screens/LeagueReviewScreen.tsx'
import ConfigScreen from './screens/ConfigScreen.tsx'
import SimulationScreen from './screens/SimulationScreen.tsx'
import EventScreen from './screens/EventScreen.tsx'
import ResultsScreen from './screens/ResultsScreen.tsx'

interface NavItem {
  label: string
  phase: AppPhase
  matches: AppPhase[]
  isEnabled: (hasLeague: boolean, hasResult: boolean) => boolean
}

const ITEMS: NavItem[] = [
  { label: 'Setup', phase: 'setup', matches: ['setup', 'review'], isEnabled: () => true },
  { label: 'Odds', phase: 'config', matches: ['config'], isEnabled: (hasLeague) => hasLeague },
  {
    label: 'Simulate',
    phase: 'simulation',
    matches: ['simulation'],
    isEnabled: (hasLeague) => hasLeague,
  },
  {
    label: 'Lottery board',
    phase: 'event',
    matches: ['event', 'results'],
    isEnabled: (_hasLeague, hasResult) => hasResult,
  },
]

export interface LotteryAppProps {
  defaultLeagueId?: string | null
  onPublish?: (entries: PosterEntry[]) => Promise<string>
}

/** The draft lottery: a self-contained phase machine persisted in localStorage. */
export default function LotteryApp({ defaultLeagueId = null, onPublish }: LotteryAppProps) {
  const phase = useAppStore((state) => state.phase)
  const hasLeague = useAppStore((state) => state.league !== null)
  const hasResult = useAppStore((state) => state.result !== null)
  const goToPhase = useAppStore((state) => state.goToPhase)

  return (
    <div className="lottery-shell bg-navy text-white">
      <nav
        aria-label="Lottery steps"
        className="flex flex-wrap items-center gap-1 border-b border-white/10 px-3 py-2 text-sm"
      >
        {ITEMS.map((item) => {
          const isEnabled = item.isEnabled(hasLeague, hasResult)
          const isActive = item.matches.includes(phase)
          return (
            <button
              key={item.phase}
              type="button"
              disabled={!isEnabled}
              title={isEnabled ? undefined : 'Load a league first'}
              className={`min-h-0 rounded-md border-0 bg-transparent px-3 py-1.5 font-semibold ${
                !isEnabled
                  ? 'cursor-not-allowed text-white/25'
                  : isActive
                    ? 'cursor-pointer bg-white/15 text-white'
                    : 'cursor-pointer text-white/60 hover:bg-white/10 hover:text-white'
              }`}
              onClick={() => goToPhase(item.phase)}
            >
              {item.label}
            </button>
          )
        })}
      </nav>
      <CurrentScreen phase={phase} defaultLeagueId={defaultLeagueId} onPublish={onPublish} />
    </div>
  )
}

function CurrentScreen({
  phase,
  defaultLeagueId,
  onPublish,
}: { phase: AppPhase } & LotteryAppProps) {
  switch (phase) {
    case 'setup':
      return <SetupScreen defaultLeagueId={defaultLeagueId} />
    case 'review':
      return <LeagueReviewScreen />
    case 'config':
      return <ConfigScreen />
    case 'simulation':
      return <SimulationScreen />
    case 'event':
      return <EventScreen />
    case 'results':
      return <ResultsScreen onPublish={onPublish} />
  }
}
