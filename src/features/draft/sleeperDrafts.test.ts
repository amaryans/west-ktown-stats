import { entriesFromDraft } from './sleeperDrafts.ts'
import type { SleeperRoster, SleeperUser } from '../../lib/sleeper/types.ts'

const users: SleeperUser[] = [
  { user_id: 'u1', display_name: 'Alice', avatar: 'av1', metadata: { team_name: 'Alpha' } },
  { user_id: 'u2', display_name: 'Bob', avatar: null, metadata: null },
  { user_id: 'u3', display_name: 'Cara', avatar: null, metadata: { team_name: 'Gamma' } },
]
const rosters: SleeperRoster[] = [
  { roster_id: 1, owner_id: 'u1' },
  { roster_id: 2, owner_id: 'u2' },
  { roster_id: 3, owner_id: 'u3' },
]

test('maps slot_to_roster_id to teams in slot order', () => {
  const entries = entriesFromDraft(
    { slot_to_roster_id: { '1': 3, '2': 1, '3': 2 }, draft_order: null, settings: { teams: 3 } },
    rosters,
    users,
  )
  expect(entries.map((e) => [e.slot, e.teamName, e.ownerName, e.sleeperUserId])).toEqual([
    [1, 'Gamma', 'Cara', 'u3'],
    [2, 'Alpha', 'Alice', 'u1'],
    [3, 'Bob', 'Bob', 'u2'],
  ])
  expect(entries[1]?.avatarUrl).toContain('av1')
  expect(entries[0]?.seed).toBeNull()
})

test('falls back to draft_order (user -> slot) and fills unknown slots', () => {
  const entries = entriesFromDraft(
    { slot_to_roster_id: null, draft_order: { u2: 1, u1: 2 }, settings: { teams: 3 } },
    rosters,
    users,
  )
  expect(entries.map((e) => e.ownerName)).toEqual(['Bob', 'Alice', 'Open slot'])
  expect(entries[0]?.sleeperRosterId).toBe(2)
})
