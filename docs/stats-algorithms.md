# Stats algorithms and tunable parameters

Every generated number on the site, what it's computed from, and the knobs you can turn. Each
section ends with a **Parameters** table: the current value, where it lives, and what changing it
does. Parameters marked _inline_ are literals in the code, not named constants yet. Pull them out
first if you want to experiment.

Shared conventions (from `src/features/analytics/common.ts` and `standings/standings.ts`):

- **Data**: one team score per regular-season week from `history.data`. Bye weeks are dropped.
  Manual (pre-Sleeper) and summary-only seasons have no weekly data, so the analytics skip them.
- **Result**: `1` win, `0.5` tie, `0` loss. **Win %** = `(wins + ties/2) / games`.
- **Weekly median**: the median of every score posted that week.
- **All-play share (one week)**: the team's win value against every other team's score that week,
  divided by the number of opponents. In a 10-team league the top score is 9/9 = 1.0 and the
  bottom score is 0/9 = 0.
- **Percentile** (report card, draft grades): `(below + (equal − 1)/2) / (n − 1) × 100`. Tied teams
  share the average rank, nulls are left out, and a single known value scores 50.
- **Letter grade** (`reportCard.ts:35`): A ≥ 80, B ≥ 60, C ≥ 40, D ≥ 20, otherwise F. Applied
  to 0–100 percentiles.

---

## 1. Power rankings (`analytics/power.ts`)

Recomputed after every played week, using only the weeks up to that point, so the page can show
movement (`prevRank`) and a rank trend line.

For each team, using weeks played so far:

| Input        | Definition                                                                             |
| ------------ | -------------------------------------------------------------------------------------- |
| `avg`        | mean weekly score                                                                      |
| `high`/`low` | best and worst weekly score                                                            |
| `winPct`     | real win %. When `medianEnabled`, each week adds a second result vs. the week's median |
| `allPlayPct` | mean of the weekly all-play shares                                                     |
| `recentPct`  | mean all-play share over the last `RECENT_WEEKS` games                                 |

**Balanced (default)**, scaled 0–100:

```
score = 100 × (0.5 × allPlayPct + 0.3 × winPct + 0.2 × recentPct)
```

**Classic ("Oberon Mt.")**, a points-scale number:

```
score = (avg × 6 + (high + low) × 2 + winPct × 400) / 10
```

Scores are rounded to 0.1. Rank order is score desc, then `avg` desc, then roster id.

How much each term is worth in classic mode: `avg × 0.6`, `(high + low) × 0.2`, and
`winPct × 40`. A team averaging 120 gets 72 from its average. Going from .500 to 1.000 is worth
+20, about the same as scoring 33 more points a week. High and low weeks together count
double-weight against one average week, so a single blowup or dud moves the score.

**Parameters**

| Parameter                    | Value              | Where                  | Effect                                                                              |
| ---------------------------- | ------------------ | ---------------------- | ----------------------------------------------------------------------------------- |
| `RECENT_WEEKS`               | 3                  | `power.ts:30`          | Form window. Larger values react more slowly                                        |
| Balanced weights             | 0.5 / 0.3 / 0.2    | `power.ts:91` _inline_ | all-play / real win % / recent all-play. They sum to 1, which keeps the 0–100 scale |
| Classic avg weight           | 6                  | `power.ts:90` _inline_ | Weight on average score                                                             |
| Classic high+low weight      | 2                  | `power.ts:90` _inline_ | Weight on extremes. Set to 0 to ignore volatility                                   |
| Classic win % weight         | 400                | `power.ts:90` _inline_ | How much winning matters against points                                             |
| Classic divisor              | 10                 | `power.ts:90` _inline_ | Scale only. Doesn't change the order                                                |
| Median game counted in win % | when league has it | `power.ts:132`         | Doubles the games in win % and softens schedule luck                                |
| Tiebreak                     | avg, roster id     | `power.ts:108`         |                                                                                     |

Ideas that fit the current structure:

- Add points-for or all-play from a trailing window to classic.
- Weight recent weeks exponentially instead of using a hard 3-game window.
- Normalise `avg` to that week's league average so seasons with different scoring compare.
- Add a strength-of-schedule term.

---

## 2. All-play, expected wins and luck (`analytics/allplay.ts`)

Per team, per week, the team's score is compared with every other score that week:

- **All-play record**: those comparisons summed over the season.
- **Expected wins** = the sum of weekly all-play shares, meaning the wins you'd expect against a
  random opponent each week.
- **Actual wins** = head-to-head wins, with ties counted as half.
- **Luck** = actual wins − expected wins. Positive means the schedule helped.
- **Lucky win**: won while scoring below that week's median. **Unlucky loss**: lost while
  scoring above it.
- **Avg points against**: the mean of the opponents' scores.

Career luck adds up every season's weeks per owner, matched by Sleeper user id.

The median game (when the league plays one) is **not** counted here. Luck is head-to-head only.

**Parameters**: none named. The lucky/unlucky thresholds are the weekly median (`allplay.ts:117`,
_inline_). You could make that a percentile, such as the top/bottom 30%.

---

## 3. Consistency and close games (`analytics/consistency.ts`)

Per team, over its weekly scores:

| Stat                  | Formula                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `avg`, `sd`           | mean and **population** standard deviation of weekly scores            |
| `cv`                  | `sd / avg`. Lower is steadier                                          |
| `floor` / `ceiling`   | min / max weekly score                                                 |
| **Boom**              | score ≥ league mean + 1 × league sd (league = every score that season) |
| **Bust**              | score ≤ league mean − 1 × league sd                                    |
| `aboveMedianPct`      | share of weeks above the weekly median                                 |
| **Close game**        | \|margin\| < `CLOSE_MARGIN`. Record in those games                     |
| Avg win / loss margin | mean margin in wins / losses                                           |
| Best loss / worst win | highest score in a loss / lowest score in a win                        |

For careers, each owner's weeks are pooled, but booms and busts are judged against the league
mean and sd of the season the score came from.

**Parameters**

| Parameter           | Value | Where                           | Effect                                       |
| ------------------- | ----- | ------------------------------- | -------------------------------------------- |
| `CLOSE_MARGIN`      | 10    | `consistency.ts:21`             | Points that make a game "close"              |
| Boom/bust threshold | 1 sd  | `consistency.ts:88-89` _inline_ | 1 sd ≈ top/bottom 16% of scores. 1.5 sd ≈ 7% |

---

## 4. Schedule swap (`analytics/schedule.ts`)

Cell `[i][j]` is team _i_'s record if it had played team _j_'s schedule: _i_'s weekly score
against whoever _j_ faced that week. If _j_ faced _i_, then _i_ plays _j_ instead. The diagonal is
the real record. Rows and columns are in head-to-head standings order.

Summary per team:

- `avgWins`: mean wins across all schedules, its own included.
- `betterWith` / `worseWith`: the number of other schedules that give it more or fewer wins.
- best and worst schedule.
- `scheduleEase`: the mean wins the other teams would get on this team's schedule. Lower means
  harder.

**Parameters**: none. The median game isn't replayed.

---

## 5. Records, awards, streaks, droughts (`analytics/records.ts`)

- **Weekly awards**, for each week:
  - high score and low score
  - blowout: largest winning margin
  - closest: smallest winning margin, where a tie counts as 0
  - heartbreak: highest score in a loss
  - lucky: lowest score in a win

  `tallyAwards` counts them per owner.

- **Record book**: the top `limit` games for highest and lowest score, biggest blowout, closest
  game, highest score in a loss, lowest score in a win, and highest combined score. It also lists
  season marks (most and fewest points, best and worst record), and these come from
  **completed** seasons only.
- **Streaks**: the longest win and loss runs per owner, carried across seasons. A tie ends a
  streak.
- **Droughts**: completed seasons since the owner's last title. This includes manual seasons and
  split titles (`isChampion`).

**Parameters**

| Parameter           | Value                                                          | Where            |
| ------------------- | -------------------------------------------------------------- | ---------------- |
| Record book `limit` | 5 by default. The Records page passes 1000 and trims in the UI | `records.ts:166` |

---

## 6. Lineup execution (`analytics/execution.ts`)

For each roster-week with player-level points:

- **Optimal** = the best legal lineup from every rostered player's actual points. The
  predictions engine's `assign` solves it exactly over the season's `roster_positions`. Negative
  scores count as 0, and optimal is never reported below actual.
- **Actual** = the sum of the starters' points. **Left** = optimal − actual.
- **Execution %** = Σactual / Σoptimal over the season.
- **Perfect week**: left < 0.005.
- **Lineup loss**: a loss or tie where the optimal lineup would have beaten the opponent's
  _actual_ score.
- **Benchings**: each player who belonged in the best lineup but sat is paired with the weakest
  starter (or empty slot) whose slot he could fill. The cost is the difference in points, and only
  positive costs are kept.
- **Position breakdown**: starter points by the player's primary position, where a flex counts as
  the player's position. **MVPs**: the top starters by points, with each one's share of the team's
  points.

**Parameters**

| Parameter               | Value | Where                       |
| ----------------------- | ----- | --------------------------- |
| Perfect-week tolerance  | 0.005 | `execution.ts:190` _inline_ |
| `worstBenchings` limit  | 10    | `execution.ts:205`          |
| `topContributors` limit | 3     | `execution.ts:268`          |

---

## 7. Trades and waivers (`analytics/transactions.ts`)

Every completed trade, waiver claim or free-agent add counts as an acquisition. Each week a player
scores for a roster, the points go to that roster's **most recent** acquisition of him from
that week or earlier. Only **starter points** are counted.

- **Trade side**:
  - gained = starter points the incoming players scored for this team
  - gave up = starter points the outgoing players scored for their new team
  - net = gained − gave up
- **Winner**: the side with the best net, when `margin = (best net − 2nd best net) / 2 ≥
EVEN_MARGIN`. Otherwise the trade is "even". In a 2-team trade, margin equals the winner's net.
- **Pickups**: the starter points each waiver or FA add produced for the team. The FAAB spent is
  listed.
- Draft picks and FAAB that change hands are shown but not valued.

**Parameters**

| Parameter     | Value | Where                 | Effect                                       |
| ------------- | ----- | --------------------- | -------------------------------------------- |
| `EVEN_MARGIN` | 10    | `transactions.ts:148` | Starter-point margin needed to name a winner |

---

## 8. Draft grades (`analytics/draft.ts`)

Keepers are excluded by default. With `includeKeepers`, a keeper counts at the pick it cost.

- **ADP value** (draft day) = ADP − pick. Positive means the player fell to the team.
- **Pick value** (post-season):
  - `value = positionPick − positionFinish`, both counted among drafted non-keepers at that
    position. For example, the 12th WR taken who finishes as WR3 gets +9.
  - If the position is unknown, it falls back to `pickNo − overall finish`.
  - Finish is by points while on any roster in the league, regular season.
- **Draft-day grade**: percentile of the team's mean ADP value. A team needs ADP for at least half
  its picks to get one.
- **Post-season grade**: percentile of the class's **starter points for the drafting team**. The
  average pick value is shown but not graded.
- **Steals**: top `value`. **Busts**: lowest `value` among the first `bustRounds` rounds.

**Parameters**

| Parameter             | Value                 | Where                                           | Effect                       |
| --------------------- | --------------------- | ----------------------------------------------- | ---------------------------- |
| ADP coverage required | 50%                   | `draft.ts:220` _inline_                         | `adpPicks × 2 ≥ picks`       |
| `bustRounds`          | 5                     | `draft.ts:188`                                  | Busts only from early rounds |
| Steals/busts `limit`  | 5 (the page passes 8) | `draft.ts:187`, `pages/analytics/Draft.tsx:191` |                              |
| Grade cutoffs         | 80/60/40/20           | `reportCard.ts:35`                              | Shared with the report card  |

---

## 9. Manager report card (`analytics/reportCard.ts`, `seasonReport.ts`)

Four skills. Each skill's raw number is turned into a 0–100 percentile against the league that
season:

| Skill   | Raw input                                                               |
| ------- | ----------------------------------------------------------------------- |
| Draft   | the draft class's starter points for the team (§8)                      |
| Waivers | starter points from waiver and FA pickups (§7)                          |
| Trades  | sum of trade nets. A team that never traded scores 0 raw, not null (§7) |
| Lineups | execution % (§6)                                                        |

```
overall = mean(known skill percentiles)     # equal weights
grade   = A ≥ 80, B ≥ 60, C ≥ 40, D ≥ 20, else F
```

Luck (§2) is shown as a percentile but is **not** part of the grade. The career card is the
mean of each season's percentiles, so every season counts the same.

**Parameters**

| Parameter     | Value          | Where                                | Effect                                             |
| ------------- | -------------- | ------------------------------------ | -------------------------------------------------- |
| Skill weights | equal (¼ each) | `reportCard.ts:68` _inline_ (`mean`) | Swap in a weighted mean to favour some skills      |
| Grade cutoffs | 80/60/40/20    | `reportCard.ts:35`                   | Percentile-based, so ~20% of teams get each letter |
| Luck in grade | excluded       | `reportCard.ts:61`                   | Add it to `SKILLS` to include it                   |

Because every skill is a percentile, the grades are **relative** (curved within the season).
Someone always gets an F. For absolute grades, map raw values with fixed thresholds instead of
percentiles.

---

## 10. Keeper success (`keepers/success.ts`)

For each past keeper:

- **Draft value** = keep pick − ADP. Positive means the keeper cost less than his draft price.
- **Performance** = keep pick − finish rank, where finish is by points among every drafted player
  that year.
- **Impact share** = the keeper's starter points / the team's total points.
- **Score (0–100)** = the mean of the three **percentiles**, each taken against every keeper in
  league history. Unknown parts are skipped.
- **Hit**: performance ≥ 0.

**Parameters**: equal weights over the three parts (`success.ts:262`, _inline_). Keeper value
before the draft (`keepers/value.ts`) = keep pick − ADP, where ADP comes from the manual "ADP"
stat, else Sleeper `search_rank`. The default cost rounds are `[5, 6]`
(`keepers/engine/types.ts:39`).

---

## 11. Playoff odds / predictions (`predictions/engine/*`)

- **Weekly forecast**: the team's mean is the optimal lineup's projected points. Its sd is
  `sqrt(Σ (PLAYER_CV × playerProjection)²)`, floored at `MIN_TEAM_SD`. Each player is treated as
  independent.
- **Simulation**: every unplayed week, each team scores `max(0, Normal(mean, sd))`. Head-to-head
  games are then resolved, plus the median game if the league has one. Teams are seeded by win %,
  then wins, then points for. After each simulated season the bracket is played (standard,
  reseeded, or Sleeper's actual bracket once it exists) to get title odds.
- **Win probability** for one game = `Φ((μa − μb) / sqrt(σa² + σb²))`.
- **Remaining SOS**: the average projected score of the remaining opponents.
- **Clinch / elimination**: exact, computed by max-flow (`clinch.ts`). No parameters.

**Parameters**

| Parameter         | Value              | Where                               | Effect                                                   |
| ----------------- | ------------------ | ----------------------------------- | -------------------------------------------------------- |
| `PLAYER_CV`       | 0.6                | `predictions/engine/forecast.ts:11` | Player volatility. A full lineup lands around ±20–25 pts |
| `MIN_TEAM_SD`     | 8                  | `predictions/engine/forecast.ts:13` | Floor on team spread                                     |
| `FALLBACK_SD`     | 25                 | `predictions/loader.ts:43`          | Spread when there are no projections                     |
| `SIMULATION_RUNS` | 10,000             | `predictions/usePredictions.ts:14`  | More runs = smoother odds, slower                        |
| `SIMULATION_SEED` | `0x574b54` ("WKT") | `predictions/usePredictions.ts:16`  | Fixed so results are repeatable                          |

---

## Tweaking safely

- The pure modules have tests next to them (`power.test.ts`, `reportCard.test.ts`, and so on).
  Run `npm test` after a change. Some tests check exact scores, so update those expectations on
  purpose.
- `PowerRankings.tsx` explains both formulas in its footer text. Keep it in sync if you change
  the weights.
- Completed seasons are cached as raw data (matchups, drafts), not as computed stats, so a
  formula change shows up on the next page load with no cache bust.
