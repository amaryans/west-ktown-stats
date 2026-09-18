# West K-Town Stats

A small static website that shows the full standings history of any [Sleeper](https://sleeper.com) fantasy football league.

- Enter a league ID and every season in the league's history is loaded automatically (Sleeper links each season to the previous one).
- Each season shows team, record, points for and points against for the regular season.
- A **Games vs. median** toggle on each season adds a record against the weekly league median and an overall record that combines both, and re-ranks the table by it. It defaults to on for seasons where the league had Sleeper's "league median" setting enabled.
- Works on phones: standings collapse into cards on narrow screens.
- No backend and no build step. The browser talks directly to the public Sleeper API. Completed seasons are cached in `localStorage`.

## Finding your league ID

It is the long number in your league's URL, e.g. `https://sleeper.com/leagues/1124831356770168832`. Any season's ID works. You can also link straight to a league with `?league=<id>`.

## Running locally

Any static file server works:

```sh
npm start          # serves on http://localhost:8080
```

## Tests

The standings math lives in `standings.js` and is unit-tested with Node's built-in test runner:

```sh
npm test
```

## Deploying

`.github/workflows/pages.yml` runs the tests and deploys the site to GitHub Pages on every push to `main`. In the repository settings, set **Pages → Source** to **GitHub Actions** once.

## How the numbers are computed

- Records are recomputed from each week's matchups rather than read from Sleeper's roster totals, so the head-to-head record is the same whether or not the league used the median setting.
- Only regular-season weeks (before `playoff_week_start`) are counted. For the current season, only weeks that have been scored are included.
- **vs. Median**: each week, a team scoring above the league median gets a win, below it a loss, and exactly on it a tie. This matches Sleeper's league-median rule.
- Sort order is win percentage, then points for, then fewest points against.
- The 🏆 badge marks the winner of the playoff bracket for completed seasons.
