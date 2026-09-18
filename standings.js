/*
 * Pure standings math for a Sleeper league season.
 * No DOM, no fetch — so it can be unit-tested in Node and reused in the browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Standings = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function num(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }

  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  /** Median of a numeric array (average of the two middle values when even). */
  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return null;
    const mid = Math.floor(n / 2);
    return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * A week counts as "played" if at least one roster scored points.
   * Sleeper returns matchup objects with 0 points for weeks that haven't happened yet.
   */
  function weekWasPlayed(matchups) {
    return Array.isArray(matchups) && matchups.some((m) => num(m.points) > 0);
  }

  function emptyLine() {
    return { wins: 0, losses: 0, ties: 0 };
  }

  function winPct(line) {
    const games = line.wins + line.losses + line.ties;
    return games === 0 ? 0 : (line.wins + line.ties / 2) / games;
  }

  function formatRecord(line) {
    return line.ties ? `${line.wins}-${line.losses}-${line.ties}` : `${line.wins}-${line.losses}`;
  }

  /**
   * Build a season's standings.
   *
   * @param {Object} params
   * @param {Array}  params.rosters       GET /league/{id}/rosters
   * @param {Array}  params.users         GET /league/{id}/users
   * @param {Object} params.matchupsByWeek  { [week:number]: Array<matchup> } for regular-season weeks
   * @returns {{ teams: Array, weeksPlayed: number[] }}
   */
  function computeSeason({ rosters, users, matchupsByWeek }) {
    const usersById = new Map((users || []).map((u) => [u.user_id, u]));
    const teams = new Map();

    for (const r of rosters || []) {
      const owner = usersById.get(r.owner_id);
      const meta = (owner && owner.metadata) || {};
      const displayName = (owner && owner.display_name) || "Unknown owner";
      teams.set(r.roster_id, {
        rosterId: r.roster_id,
        ownerId: r.owner_id || null,
        ownerName: displayName,
        teamName: meta.team_name || displayName,
        avatar: (owner && owner.avatar) || null,
        teamAvatarUrl: meta.avatar || null,
        h2h: emptyLine(),
        median: emptyLine(),
        pointsFor: 0,
        pointsAgainst: 0,
        weekly: [],
      });
    }

    const weeks = Object.keys(matchupsByWeek || {})
      .map(Number)
      .filter((w) => Number.isFinite(w))
      .sort((a, b) => a - b);

    const weeksPlayed = [];

    for (const week of weeks) {
      const matchups = matchupsByWeek[week];
      if (!weekWasPlayed(matchups)) continue;
      weeksPlayed.push(week);

      // Group by matchup_id for head-to-head results.
      const byMatchup = new Map();
      const scores = [];
      for (const m of matchups) {
        const team = teams.get(m.roster_id);
        if (!team) continue;
        const pts = num(m.points);
        scores.push(pts);
        team.pointsFor += pts;
        if (m.matchup_id == null) continue; // bye week
        if (!byMatchup.has(m.matchup_id)) byMatchup.set(m.matchup_id, []);
        byMatchup.get(m.matchup_id).push({ team, pts });
      }

      for (const sides of byMatchup.values()) {
        if (sides.length !== 2) continue; // malformed / bye
        const [a, b] = sides;
        a.team.pointsAgainst += b.pts;
        b.team.pointsAgainst += a.pts;
        if (a.pts > b.pts) {
          a.team.h2h.wins++;
          b.team.h2h.losses++;
        } else if (a.pts < b.pts) {
          b.team.h2h.wins++;
          a.team.h2h.losses++;
        } else {
          a.team.h2h.ties++;
          b.team.h2h.ties++;
        }
        a.team.weekly.push({ week, points: a.pts, opponentRosterId: b.team.rosterId, opponentPoints: b.pts });
        b.team.weekly.push({ week, points: b.pts, opponentRosterId: a.team.rosterId, opponentPoints: a.pts });
      }

      // Game against the league median: above the median is a win, below a loss, exactly on it a tie.
      const med = median(scores);
      if (med == null) continue;
      for (const m of matchups) {
        const team = teams.get(m.roster_id);
        if (!team) continue;
        const pts = num(m.points);
        if (pts > med) team.median.wins++;
        else if (pts < med) team.median.losses++;
        else team.median.ties++;
      }
    }

    const list = Array.from(teams.values()).map((t) => {
      const combined = {
        wins: t.h2h.wins + t.median.wins,
        losses: t.h2h.losses + t.median.losses,
        ties: t.h2h.ties + t.median.ties,
      };
      return Object.assign(t, {
        combined,
        pointsFor: round2(t.pointsFor),
        pointsAgainst: round2(t.pointsAgainst),
      });
    });

    return { teams: list, weeksPlayed };
  }

  /**
   * Sort teams for display. Tiebreaker after win percentage is points for (Sleeper's default).
   * @param {"h2h"|"combined"} mode
   */
  function rank(teams, mode) {
    const key = mode === "combined" ? "combined" : "h2h";
    return teams
      .slice()
      .sort((a, b) => {
        const pct = winPct(b[key]) - winPct(a[key]);
        if (pct !== 0) return pct;
        if (b[key].wins !== a[key].wins) return b[key].wins - a[key].wins;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        return a.pointsAgainst - b.pointsAgainst;
      })
      .map((t, i) => Object.assign({}, t, { rank: i + 1 }));
  }

  /**
   * Which weeks make up the regular season for a league, given its settings and the NFL state.
   * Returns an array of week numbers to fetch.
   */
  function regularSeasonWeeks(league, nflState) {
    const settings = (league && league.settings) || {};
    let lastRegularWeek = num(settings.playoff_week_start) - 1;
    if (lastRegularWeek <= 0) {
      // No playoffs configured; fall back to the length of the NFL regular season for that year.
      lastRegularWeek = num(league.season) >= 2021 ? 18 : 17;
    }
    let lastWeek = lastRegularWeek;
    if (nflState && String(nflState.season) === String(league.season)) {
      if (nflState.season_type === "pre" || nflState.season_type === "off") {
        // "off" after the season means everything is played; "off"/"pre" before it means nothing is.
        if (num(nflState.week) <= 1 && nflState.season_type === "pre") lastWeek = 0;
      } else if (nflState.season_type === "regular") {
        // Include the current week too: if it hasn't started, weekWasPlayed() will drop it.
        lastWeek = Math.min(lastRegularWeek, num(nflState.week));
      }
    }
    const weeks = [];
    for (let w = 1; w <= lastWeek; w++) weeks.push(w);
    return weeks;
  }

  return { computeSeason, rank, median, formatRecord, winPct, regularSeasonWeeks, weekWasPlayed };
});
