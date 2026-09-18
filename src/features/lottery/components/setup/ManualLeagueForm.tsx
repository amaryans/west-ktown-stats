import { useState } from 'react'
import { MAX_TEAMS, MIN_TEAMS } from '../../engine/odds.ts'
import type { League, Team } from '../../data/types.ts'
import Button from '../common/Button.tsx'

interface ManualLeagueFormProps {
  onCreated: (league: League) => void
}

const DEFAULT_TEAM_COUNT = 12

function makeBlankTeam(index: number): Team {
  return {
    id: crypto.randomUUID(),
    ownerName: `Owner ${index + 1}`,
    teamName: `Team ${index + 1}`,
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    avatarUrl: null,
    playoffFinish: null,
  }
}

export default function ManualLeagueForm({ onCreated }: ManualLeagueFormProps) {
  const [leagueName, setLeagueName] = useState('')
  const [teamCount, setTeamCount] = useState(DEFAULT_TEAM_COUNT)

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onCreated({
          source: 'manual',
          name: leagueName.trim() || 'My League',
          teams: Array.from({ length: teamCount }, (_, i) => makeBlankTeam(i)),
        })
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-white/80">
        League name
        <input
          className="w-full rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-white placeholder-white/40 focus:border-white/60 focus:outline-none"
          value={leagueName}
          onChange={(event) => setLeagueName(event.target.value)}
          placeholder="My League"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-white/80">
        Number of teams
        <select
          className="w-full cursor-pointer rounded-lg border border-white/30 bg-white/10 px-4 py-2.5 text-white focus:border-white/60 focus:outline-none"
          value={teamCount}
          onChange={(event) => setTeamCount(Number(event.target.value))}
        >
          {Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => MIN_TEAMS + i).map(
            (count) => (
              <option key={count} value={count} className="text-black">
                {count}
              </option>
            ),
          )}
        </select>
      </label>
      <Button type="submit">Create league</Button>
    </form>
  )
}
