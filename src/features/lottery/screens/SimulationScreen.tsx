import { useMemo, useState } from 'react'
import { useAppStore } from '../state/store.ts'
import { buildLotteryConfig, seededTeamsFor } from '../data/lotteryConfig.ts'
import { simulateDistribution } from '../engine/simulate.ts'
import Button from '../components/common/Button.tsx'
import TeamAvatar from '../components/common/TeamAvatar.tsx'

const TRIAL_OPTIONS = [1_000, 10_000, 50_000]
const DEFAULT_TRIALS = 10_000
const TOP_GROUP_SIZE = 4

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
}

function formatShare(probability: number): string {
  if (probability === 0) {
    return '—'
  }
  const percent = probability * 100
  return percent < 0.05 ? '<0.1' : percent.toFixed(1)
}

export default function SimulationScreen() {
  const league = useAppStore((state) => state.league)
  const settings = useAppStore((state) => state.settings)
  const goToPhase = useAppStore((state) => state.goToPhase)

  const [trials, setTrials] = useState(DEFAULT_TRIALS)
  const [baseSeed, setBaseSeed] = useState(randomSeed)

  const seededTeams = useMemo(
    () => (league ? seededTeamsFor(league, settings) : []),
    [league, settings],
  )
  const simulation = useMemo(() => {
    if (!league || seededTeams.length === 0) {
      return null
    }
    return simulateDistribution(buildLotteryConfig(league, settings), trials, baseSeed)
  }, [league, settings, seededTeams, trials, baseSeed])

  if (!league || !simulation) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-navy text-white">
        <p>Load a league to run simulations.</p>
        <Button onClick={() => goToPhase('setup')}>Back to setup</Button>
      </div>
    )
  }

  const teamCount = seededTeams.length
  const showTopGroup = teamCount > TOP_GROUP_SIZE

  return (
    <div className="flex min-h-[60vh] flex-col items-center gap-6 bg-navy px-4 py-8 text-white">
      <header className="w-full max-w-6xl">
        <h1 className="text-3xl font-bold">Simulation test</h1>
        <p className="mt-1 max-w-2xl text-white/60">
          {simulation.trials.toLocaleString()} simulated lotteries with your current settings —
          custom odds and pick floors included. Each cell is the share of simulations where that
          team landed that pick.
        </p>
      </header>

      <div className="flex w-full max-w-6xl items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-white/70">
          Simulations
          <select
            className="cursor-pointer rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-white focus:border-white/60 focus:outline-none"
            value={trials}
            onChange={(event) => setTrials(Number(event.target.value))}
          >
            {TRIAL_OPTIONS.map((option) => (
              <option key={option} value={option} className="text-black">
                {option.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={() => setBaseSeed(randomSeed())}>
          Re-run 🎲
        </Button>
      </div>

      <div className="w-full max-w-6xl overflow-x-auto rounded-2xl border border-white/15 bg-white/5">
        <table className="w-full min-w-[640px] text-right text-sm tabular-nums">
          <thead className="border-b border-white/15 text-white/60">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Team</th>
              {showTopGroup && (
                <th className="border-r border-white/15 px-3 py-2 font-medium text-gold">
                  Top {TOP_GROUP_SIZE} %
                </th>
              )}
              {Array.from({ length: teamCount }, (_, i) => (
                <th key={i} className="px-2.5 py-2 font-medium">
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seededTeams.map((team, seedIndex) => {
              const row = simulation.probabilities[seedIndex] ?? []
              const topShare = row
                .slice(0, TOP_GROUP_SIZE)
                .reduce((sum, probability) => sum + probability, 0)
              return (
                <tr key={team.id} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2 text-left">
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-right text-xs text-white/50">{seedIndex + 1}</span>
                      <TeamAvatar src={team.avatarUrl} alt="" className="size-7" />
                      <span className="max-w-40 truncate font-medium">{team.teamName}</span>
                    </div>
                  </td>
                  {showTopGroup && (
                    <td className="border-r border-white/15 px-3 py-2 font-semibold text-gold">
                      {formatShare(topShare)}
                    </td>
                  )}
                  {row.map((probability, pickIndex) => (
                    <td
                      key={pickIndex}
                      className={`px-2.5 py-2 ${probability === 0 ? 'text-white/25' : ''}`}
                    >
                      {formatShare(probability)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="max-w-6xl text-xs text-white/40">
        Values are percentages. A dash means the outcome never occurred — for example, a team with a
        pick floor can never fall past it.
      </p>
    </div>
  )
}
