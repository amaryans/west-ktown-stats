import { useAppStore } from '../state/store.ts'
import { makeSampleLeague } from '../data/sampleLeague.ts'
import SleeperImportForm from '../components/setup/SleeperImportForm.tsx'
import ManualLeagueForm from '../components/setup/ManualLeagueForm.tsx'
import Button from '../components/common/Button.tsx'

interface SetupScreenProps {
  defaultLeagueId?: string | null
}

export default function SetupScreen({ defaultLeagueId = null }: SetupScreenProps) {
  const setLeague = useAppStore((state) => state.setLeague)
  const league = useAppStore((state) => state.league)
  const goToPhase = useAppStore((state) => state.goToPhase)

  return (
    <div className="flex min-h-[60vh] flex-col items-center gap-10 bg-navy px-4 py-8 text-white">
      <header className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">Draft lottery</h1>
        <p className="mt-3 max-w-xl text-lg text-white/70">
          NBA-style weighted lottery for the draft order: import last season&apos;s standings, set
          the odds, then reveal the picks one card at a time on draft night.
        </p>
      </header>

      {league && (
        <Button variant="secondary" onClick={() => goToPhase('review')}>
          Continue with {league.name} →
        </Button>
      )}

      <div className="grid w-full max-w-4xl gap-6 sm:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/5 p-6">
          <h2 className="text-2xl font-bold">Import from Sleeper</h2>
          <p className="text-sm text-white/60">
            {defaultLeagueId
              ? 'The league linked in Settings is filled in — Sleeper needs last season\u2019s standings, so the previous season is offered automatically if this one has no results yet.'
              : 'Pull in your league\u2019s teams, records, and standings automatically.'}
          </p>
          <SleeperImportForm onImported={setLeague} defaultLeagueId={defaultLeagueId} />
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/5 p-6">
          <h2 className="text-2xl font-bold">Manual setup</h2>
          <p className="text-sm text-white/60">
            Not on Sleeper? Enter your owners and records by hand.
          </p>
          <ManualLeagueForm onCreated={setLeague} />
        </section>
      </div>

      <Button variant="ghost" onClick={() => setLeague(makeSampleLeague())}>
        Or try a sample league first →
      </Button>
    </div>
  )
}
