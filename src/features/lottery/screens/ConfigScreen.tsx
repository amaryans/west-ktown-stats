import { useMemo, useState } from 'react'
import { useAppStore } from '../state/store.ts'
import { hasPlayoffResults } from '../data/ordering.ts'
import { seededTeamsFor } from '../data/lotteryConfig.ts'
import { MAX_TEAMS, MIN_TEAMS, oddsForLeagueSize, renormalizeToBps } from '../engine/odds.ts'
import { validateFloors } from '../engine/lottery.ts'
import type { OrderingSource, SlotMode } from '../data/types.ts'
import Button from '../components/common/Button.tsx'
import ErrorBanner from '../components/common/ErrorBanner.tsx'
import OddsTable from '../components/config/OddsTable.tsx'

const BPS_TOTAL = 10000

const ORDERING_OPTIONS: { value: OrderingSource; label: string; description: string }[] = [
  {
    value: 'regularSeason',
    label: 'Regular season standings',
    description: 'Worst record gets the best odds.',
  },
  {
    value: 'playoffs',
    label: 'Playoff results',
    description: 'Final placements set the order — the champion always seeds last.',
  },
]

const SLOT_OPTIONS: { value: SlotMode; label: string; description: string }[] = [
  {
    value: 'winnerChoosesSlot',
    label: 'Winners pick their slot',
    description: 'Each revealed winner chooses any open draft position.',
  },
  {
    value: 'lotteryIsOrder',
    label: 'Lottery order is the draft order',
    description: 'The #1 lottery winner drafts first, and so on.',
  },
]

export default function ConfigScreen() {
  const league = useAppStore((state) => state.league)
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const goToPhase = useAppStore((state) => state.goToPhase)
  const startLottery = useAppStore((state) => state.startLottery)
  const startOver = useAppStore((state) => state.startOver)

  const [showAdvanced, setShowAdvanced] = useState(
    settings.customOddsBps !== null || settings.pickFloors !== null,
  )

  const teams = useMemo(() => league?.teams ?? [], [league])
  const teamCount = teams.length
  const playoffsAvailable = hasPlayoffResults(teams)
  const isSupportedSize = teamCount >= MIN_TEAMS && teamCount <= MAX_TEAMS

  const seededTeams = useMemo(
    () => (league && isSupportedSize ? seededTeamsFor(league, settings) : []),
    [league, settings, isSupportedSize],
  )

  // Draft values shown in the advanced editor (custom overrides or the NBA table).
  const oddsDraft = useMemo(() => {
    if (!isSupportedSize) {
      return []
    }
    const custom = settings.customOddsBps
    return custom?.length === teamCount ? custom : oddsForLeagueSize(teamCount)
  }, [settings.customOddsBps, teamCount, isSupportedSize])

  const floorsDraft = useMemo(() => {
    const floors = settings.pickFloors
    return floors?.length === teamCount ? floors : new Array<number | null>(teamCount).fill(null)
  }, [settings.pickFloors, teamCount])

  const oddsSum = oddsDraft.reduce((sum, bps) => sum + bps, 0)
  const oddsError =
    settings.customOddsBps !== null && oddsSum !== BPS_TOTAL
      ? `Odds must add up to 100% — currently ${(oddsSum / 100).toFixed(1)}%. Use Normalize to fix.`
      : settings.customOddsBps !== null && oddsDraft.some((bps) => bps <= 0)
        ? 'Every team needs odds above 0%.'
        : null
  const floorsError = isSupportedSize ? validateFloors(floorsDraft, teamCount) : null
  const canStart = isSupportedSize && oddsError === null && floorsError === null

  function setOddsAt(index: number, percent: number) {
    const next = oddsDraft.map((bps, i) => (i === index ? Math.round(percent * 100) : bps))
    updateSettings({ customOddsBps: next })
  }

  function setFloorAt(index: number, floor: number | null) {
    const next = floorsDraft.map((value, i) => (i === index ? floor : value))
    updateSettings({ pickFloors: next.every((value) => value === null) ? null : next })
  }

  if (!league) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-navy text-white">
        <p>No league loaded yet.</p>
        <Button onClick={startOver}>Back to setup</Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center gap-8 bg-navy px-4 py-10 text-white">
      <header className="w-full max-w-5xl">
        <h1 className="text-3xl font-bold">Lottery settings</h1>
        <p className="mt-1 text-white/60">{league.name}</p>
      </header>

      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <div className="flex flex-col gap-6">
          <fieldset className="rounded-2xl border border-white/15 bg-white/5 p-5">
            <legend className="px-1 text-sm font-semibold text-white/80">Lottery order from</legend>
            <div className="flex flex-col gap-3">
              {ORDERING_OPTIONS.map((option) => {
                const isDisabled = option.value === 'playoffs' && !playoffsAvailable
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-white/5 ${isDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <input
                      type="radio"
                      name="orderingSource"
                      className="mt-1 accent-accent"
                      checked={settings.orderingSource === option.value}
                      disabled={isDisabled}
                      onChange={() => updateSettings({ orderingSource: option.value })}
                    />
                    <span>
                      <span className="font-medium">{option.label}</span>
                      <span className="block text-sm text-white/60">
                        {isDisabled
                          ? 'Unavailable — no playoff results found for this league.'
                          : option.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-white/15 bg-white/5 p-5">
            <legend className="px-1 text-sm font-semibold text-white/80">Draft slots</legend>
            <div className="flex flex-col gap-3">
              {SLOT_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-white/5"
                >
                  <input
                    type="radio"
                    name="slotMode"
                    className="mt-1 accent-accent"
                    checked={settings.slotMode === option.value}
                    onChange={() => updateSettings({ slotMode: option.value })}
                  />
                  <span>
                    <span className="font-medium">{option.label}</span>
                    <span className="block text-sm text-white/60">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button variant="secondary" onClick={() => goToPhase('simulation')}>
            Test these odds with simulations →
          </Button>
        </div>

        <section className="rounded-2xl border border-white/15 bg-white/5 p-5">
          <h2 className="mb-3 text-lg font-semibold">Odds preview</h2>
          {isSupportedSize ? (
            <OddsTable seededTeams={seededTeams} oddsBps={oddsDraft} />
          ) : (
            <ErrorBanner
              message={`Leagues of ${teamCount} teams aren't supported — the lottery works for ${MIN_TEAMS} to ${MAX_TEAMS} teams.`}
            />
          )}
        </section>
      </div>

      {isSupportedSize && (
        <section className="w-full max-w-5xl rounded-2xl border border-white/15 bg-white/5 p-5">
          <button
            type="button"
            className="cursor-pointer text-lg font-semibold text-white/90 hover:text-white"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((value) => !value)}
          >
            {showAdvanced ? '▾' : '▸'} Advanced settings
          </button>

          {showAdvanced && (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-sm text-white/60">
                Customize each seed&apos;s chance at the #1 pick, and set a pick floor to guarantee
                a team never falls below a certain spot (like the NBA, where the worst team can
                never drop past pick 5).
              </p>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-white/15 text-white/60">
                    <tr>
                      <th className="px-3 py-2 font-medium">Seed</th>
                      <th className="px-3 py-2 font-medium">Team</th>
                      <th className="px-3 py-2 text-right font-medium">#1 pick odds %</th>
                      <th className="px-3 py-2 text-right font-medium">Pick floor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seededTeams.map((team, index) => (
                      <tr key={team.id} className="border-b border-white/5 last:border-0">
                        <td className="px-3 py-1.5 tabular-nums text-white/60">{index + 1}</td>
                        <td className="px-3 py-1.5 font-medium">{team.teamName}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            min={0.1}
                            max={100}
                            step={0.1}
                            aria-label={`Odds percent for ${team.teamName}`}
                            className="w-24 rounded border border-white/20 bg-white/10 px-2 py-1 text-right tabular-nums focus:border-white/50 focus:outline-none"
                            value={(oddsDraft[index] ?? 0) / 100}
                            onChange={(event) => setOddsAt(index, Number(event.target.value) || 0)}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <select
                            aria-label={`Pick floor for ${team.teamName}`}
                            className="cursor-pointer rounded border border-white/20 bg-white/10 px-2 py-1 focus:border-white/50 focus:outline-none"
                            value={floorsDraft[index] ?? ''}
                            onChange={(event) =>
                              setFloorAt(
                                index,
                                event.target.value === '' ? null : Number(event.target.value),
                              )
                            }
                          >
                            <option value="" className="text-black">
                              None
                            </option>
                            {Array.from({ length: teamCount }, (_, i) => i + 1).map((floor) => (
                              <option key={floor} value={floor} className="text-black">
                                Top {floor}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`text-sm tabular-nums ${oddsSum === BPS_TOTAL ? 'text-white/60' : 'text-red-300'}`}
                >
                  Total: {(oddsSum / 100).toFixed(1)}%
                </span>
                <Button
                  variant="secondary"
                  disabled={oddsSum === BPS_TOTAL}
                  onClick={() => updateSettings({ customOddsBps: renormalizeToBps(oddsDraft) })}
                >
                  Normalize to 100%
                </Button>
                <Button
                  variant="ghost"
                  disabled={settings.customOddsBps === null && settings.pickFloors === null}
                  onClick={() => updateSettings({ customOddsBps: null, pickFloors: null })}
                >
                  Reset to NBA odds
                </Button>
              </div>

              <ErrorBanner message={oddsError ?? floorsError} />
            </div>
          )}
        </section>
      )}

      <footer className="flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => goToPhase('review')}>
          ← Back to review
        </Button>
        <Button className="px-8 py-3 text-lg" disabled={!canStart} onClick={() => startLottery()}>
          Start the lottery 🏈
        </Button>
      </footer>
    </div>
  )
}
