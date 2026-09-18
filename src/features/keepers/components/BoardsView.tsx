import { useState } from 'react'
import type { AssembledData } from '../api'
import type { EligibilityResult, TeamId } from '../engine'
import { boardCsv, boardMarkdown } from '../lib/export'
import type { Selections } from '../lib/selection'
import { TeamBoard } from './TeamBoard'

export function BoardsView(props: {
  data: AssembledData
  result: EligibilityResult
  selections: Selections
  onToggle: (teamId: TeamId, playerId: string) => void
  onBack: () => void
}) {
  const { data, result } = props
  const [activeTeam, setActiveTeam] = useState<TeamId | 'all'>('all')
  const [copied, setCopied] = useState(false)

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(boardMarkdown(data, result, props.selections))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadCsv = () => {
    const blob = new Blob([boardCsv(data, result)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${data.previousLeague.name.replaceAll(' ', '-')}-${data.upcomingSeason}-keepers.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const teams = data.engineInput.teams
  const visible = activeTeam === 'all' ? teams : teams.filter((team) => team.id === activeTeam)

  return (
    <div className="stack">
      <div className="card card-header" style={{ marginBottom: 0 }}>
        <div>
          <strong>
            {data.previousLeague.name} — {data.upcomingSeason} keeper options
          </strong>
          <span className="muted small">
            {' '}
            {result.claims.length} options · {result.disqualified.length} disqualified · tick
            players to test keeper combos
          </span>
        </div>
        <div className="row">
          <button type="button" onClick={props.onBack}>
            ← Edit keepers
          </button>
          <button type="button" onClick={() => void copyMarkdown()}>
            {copied ? 'Copied!' : 'Copy Markdown'}
          </button>
          <button type="button" onClick={downloadCsv}>
            Download CSV
          </button>
        </div>
      </div>

      <nav className="subtabs" aria-label="Teams">
        <button
          type="button"
          className={activeTeam === 'all' ? 'subtab active' : 'subtab'}
          onClick={() => setActiveTeam('all')}
        >
          All teams
        </button>
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            className={activeTeam === team.id ? 'subtab active' : 'subtab'}
            onClick={() => setActiveTeam(team.id)}
          >
            {team.name}
          </button>
        ))}
      </nav>

      {visible.map((team) => (
        <TeamBoard
          key={team.id}
          data={data}
          result={result}
          teamId={team.id}
          selections={props.selections}
          onToggle={props.onToggle}
        />
      ))}
    </div>
  )
}
