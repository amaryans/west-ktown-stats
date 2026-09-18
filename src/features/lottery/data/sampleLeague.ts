import type { League } from './types.ts'
import { mapSleeperLeague } from './sleeper/mapping.ts'
import leagueFixture from './sleeper/__fixtures__/league.json'
import rostersFixture from './sleeper/__fixtures__/rosters.json'
import usersFixture from './sleeper/__fixtures__/users.json'
import winnersBracketFixture from './sleeper/__fixtures__/winners_bracket.json'

/** A bundled real-shaped league so anyone can try the app without a Sleeper account. */
export function makeSampleLeague(): League {
  const league = mapSleeperLeague({
    league: leagueFixture,
    rosters: rostersFixture,
    users: usersFixture,
    winnersBracket: winnersBracketFixture,
  })
  return { ...league, name: 'Sample League' }
}
