import type { Team } from '../../data/types.ts'
import TeamAvatar from '../common/TeamAvatar.tsx'

interface OddsTableProps {
  /** Teams sorted worst-first (seed 1 first). */
  seededTeams: Team[]
  /** Odds in basis points, parallel to seededTeams. */
  oddsBps: number[]
}

function formatRecord(team: Team): string {
  const base = `${team.wins}-${team.losses}`
  return team.ties > 0 ? `${base}-${team.ties}` : base
}

export default function OddsTable({ seededTeams, oddsBps }: OddsTableProps) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-white/15 text-white/60">
        <tr>
          <th className="px-3 py-2 font-medium">Seed</th>
          <th className="px-3 py-2 font-medium">Team</th>
          <th className="px-3 py-2 text-center font-medium">Record</th>
          <th className="px-3 py-2 text-right font-medium">#1 pick odds</th>
        </tr>
      </thead>
      <tbody>
        {seededTeams.map((team, index) => (
          <tr key={team.id} className="border-b border-white/5 last:border-0">
            <td className="px-3 py-2 tabular-nums text-white/60">{index + 1}</td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <TeamAvatar src={team.avatarUrl} alt="" className="size-8" />
                <span className="font-medium">{team.teamName}</span>
                <span className="text-white/50">· {team.ownerName}</span>
              </div>
            </td>
            <td className="px-3 py-2 text-center tabular-nums text-white/70">
              {formatRecord(team)}
            </td>
            <td className="px-3 py-2 text-right font-semibold tabular-nums">
              {((oddsBps[index] ?? 0) / 100).toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
