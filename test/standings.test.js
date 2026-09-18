const assert = require("node:assert/strict");
const test = require("node:test");
const S = require("../standings.js");

// Four teams, two weeks. Week 3 is "unplayed" (all zeros) and must be ignored.
const rosters = [1, 2, 3, 4].map((id) => ({ roster_id: id, owner_id: `u${id}` }));
const users = [
  { user_id: "u1", display_name: "Alice", metadata: { team_name: "Alpha" } },
  { user_id: "u2", display_name: "Bob", metadata: {} },
  { user_id: "u3", display_name: "Cara", metadata: { team_name: "Gamma" } },
  { user_id: "u4", display_name: "Dan", metadata: { team_name: "Delta" } },
];
const matchupsByWeek = {
  1: [
    { roster_id: 1, matchup_id: 1, points: 120 },
    { roster_id: 2, matchup_id: 1, points: 100 },
    { roster_id: 3, matchup_id: 2, points: 90 },
    { roster_id: 4, matchup_id: 2, points: 110 },
  ],
  2: [
    { roster_id: 1, matchup_id: 1, points: 80 },
    { roster_id: 3, matchup_id: 1, points: 95 },
    { roster_id: 2, matchup_id: 2, points: 105 },
    { roster_id: 4, matchup_id: 2, points: 105 },
  ],
  3: [
    { roster_id: 1, matchup_id: 1, points: 0 },
    { roster_id: 2, matchup_id: 1, points: 0 },
    { roster_id: 3, matchup_id: 2, points: 0 },
    { roster_id: 4, matchup_id: 2, points: 0 },
  ],
};

test("median", () => {
  assert.equal(S.median([1, 2, 3, 4]), 2.5);
  assert.equal(S.median([3, 1, 2]), 2);
  assert.equal(S.median([]), null);
});

test("computeSeason: h2h, median, points, unplayed weeks", () => {
  const { teams, weeksPlayed } = S.computeSeason({ rosters, users, matchupsByWeek });
  assert.deepEqual(weeksPlayed, [1, 2]);
  const byId = Object.fromEntries(teams.map((t) => [t.rosterId, t]));

  // Week 1 median = (100+110)/2 = 105; week 2 median = (95+105)/2 = 100
  assert.deepEqual(byId[1].h2h, { wins: 1, losses: 1, ties: 0 });
  assert.deepEqual(byId[1].median, { wins: 1, losses: 1, ties: 0 });
  assert.equal(byId[1].pointsFor, 200);
  assert.equal(byId[1].pointsAgainst, 195);

  assert.deepEqual(byId[2].h2h, { wins: 0, losses: 1, ties: 1 });
  assert.deepEqual(byId[2].median, { wins: 1, losses: 1, ties: 0 });
  assert.deepEqual(byId[2].combined, { wins: 1, losses: 2, ties: 1 });
  assert.equal(byId[2].teamName, "Bob"); // falls back to display name

  assert.deepEqual(byId[3].h2h, { wins: 1, losses: 1, ties: 0 });
  assert.deepEqual(byId[3].median, { wins: 0, losses: 2, ties: 0 });

  assert.deepEqual(byId[4].h2h, { wins: 1, losses: 0, ties: 1 });
  assert.deepEqual(byId[4].median, { wins: 2, losses: 0, ties: 0 });
  assert.deepEqual(byId[4].combined, { wins: 3, losses: 0, ties: 1 });
});

test("median tie: score exactly on the median counts as a tie", () => {
  const r = S.computeSeason({
    rosters: rosters.slice(0, 3),
    users,
    matchupsByWeek: { 1: [
      { roster_id: 1, matchup_id: 1, points: 50 },
      { roster_id: 2, matchup_id: 1, points: 60 },
      { roster_id: 3, matchup_id: null, points: 70 },
    ] },
  });
  const byId = Object.fromEntries(r.teams.map((t) => [t.rosterId, t]));
  assert.deepEqual(byId[2].median, { wins: 0, losses: 0, ties: 1 });
  assert.deepEqual(byId[3].h2h, { wins: 0, losses: 0, ties: 0 }); // bye
  assert.equal(byId[3].pointsFor, 70);
});

test("rank: by win pct, then points for; combined mode changes order", () => {
  const { teams } = S.computeSeason({ rosters, users, matchupsByWeek });
  const h2h = S.rank(teams, "h2h").map((t) => t.rosterId);
  const combined = S.rank(teams, "combined").map((t) => t.rosterId);
  // h2h: team4 .750, team1 .500 (200 PF), team3 .500 (185 PF), team2 .250
  assert.deepEqual(h2h, [4, 1, 3, 2]);
  // combined: team4 3-0-1, team1 2-2, team2 1-2-1 (.375), team3 1-3 (.250)
  assert.deepEqual(combined, [4, 1, 2, 3]);
  assert.equal(S.rank(teams, "h2h")[0].rank, 1);
});

test("formatRecord", () => {
  assert.equal(S.formatRecord({ wins: 9, losses: 5, ties: 0 }), "9-5");
  assert.equal(S.formatRecord({ wins: 9, losses: 4, ties: 1 }), "9-4-1");
});

test("regularSeasonWeeks", () => {
  const league = { season: "2023", settings: { playoff_week_start: 15 } };
  assert.equal(S.regularSeasonWeeks(league, { season: "2025", season_type: "regular", week: 3 }).length, 14);
  // Current season, week 3 in progress: fetch weeks 1..3 (week 3 dropped later if unplayed)
  assert.deepEqual(S.regularSeasonWeeks(league, { season: "2023", season_type: "regular", week: 3 }), [1, 2, 3]);
  // Current season, postseason: everything
  assert.equal(S.regularSeasonWeeks(league, { season: "2023", season_type: "post", week: 19 }).length, 14);
  // Preseason of current season: nothing
  assert.deepEqual(S.regularSeasonWeeks(league, { season: "2023", season_type: "pre", week: 1 }), []);
  // No playoffs configured
  assert.equal(S.regularSeasonWeeks({ season: "2019", settings: {} }, null).length, 17);
  assert.equal(S.regularSeasonWeeks({ season: "2022", settings: { playoff_week_start: 0 } }, null).length, 18);
});
