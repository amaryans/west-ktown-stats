# Keeper Eligibility Rules — Normative Spec

This document restates the league's keeper rules in implementation-ready form. It is the
single source of truth for the rules engine: every rule and example here maps 1:1 to a
named unit-test fixture. Rule IDs mirror the league rules document.

Seasons are referred to generically: the **previous season** is the completed season whose
draft, rosters, and keepers feed the calculation (e.g., 2024); the **upcoming season** is
the draft being prepared (e.g., 2025).

## Definitions

| Term                       | Meaning                                                                                                           | Sleeper source                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Drafted by**             | The team whose pick selected the player in the previous season's draft. A player never selected is **undrafted**. | `pick.roster_id` on `GET /v1/draft/{draft_id}/picks`    |
| **Draft round**            | The round of that pick.                                                                                           | `pick.round`                                            |
| **Final roster**           | The players on a team's roster in the previous-season league at end of season, including bench, IR, and taxi.     | `GET /v1/league/{id}/rosters` → `players[]`             |
| **Free agent**             | A drafted player who is on no team's final roster.                                                                | derived                                                 |
| **Kept (previous season)** | The player entered the previous season's draft as a keeper.                                                       | `pick.is_keeper`, plus manual entry/override in the app |

## Rule 1 — Disqualification

A player is ineligible to be kept by **any** team in the upcoming draft if either is true:

- **1.1** — Player was kept by any team in the previous season.
- **1.2** — Player was drafted in rounds 1–4 of the previous season's draft.

Disqualification is league-wide and absolute; no claim in Rule 3 can override it.

## Rule 2 — Keeper round cost

- **2.1 (draft-position cost)** — Player is kept at the round in which they were drafted in
  the previous season's draft.
- **2.2 (default cost)** — Player is kept in **round 5**. If the team's round 5 is already
  occupied by another keeper, the player is kept in **round 6** instead.

Notes:

- Round 5 counts as "occupied" regardless of which rule put a keeper there — including a
  round-5 draftee kept at draft position under 2.1 (confirmed by Example E3).
- 2.1 is available only to the team that drafted the player (see 3.1.1). Every other claim
  uses 2.2 — including a drafting team reclaiming its own draftee under 3.2.2 (confirmed by
  Example E5: an 11th-round draftee is reclaimed at round 5, not round 11).

## Rule 3 — Who may keep whom

Let **D(P)** = team that drafted player P (or none), **R(P)** = team with P on its final
roster (or none). For any P not disqualified by Rule 1:

- **3.1** — P is on team T's final roster (R(P) = T):
  - **3.1.1** — If D(P) = T, T may keep P at **2.1** (their own draft round).
  - **3.1.2** — If D(P) ≠ T (drafted by another team, or undrafted), T may keep P at **2.2**.
- **3.2** — P was drafted by T1 but is not on T1's final roster (D(P) = T1, R(P) ≠ T1):
  - **3.2.1** — If R(P) = T2, T2 has the first right to keep P (this is T2's 3.1.2 claim).
  - **3.2.2** — If T2 does **not** exercise that right, T1 may keep P at **2.2**.
  - **3.2.3** — If P is a free agent (R(P) = none), T1 may keep P at **2.2**.

### Decision table

| D(P) | R(P)      | Who may keep            | Cost              | Rule              |
| ---- | --------- | ----------------------- | ----------------- | ----------------- |
| T    | T         | T                       | draft round (2.1) | 3.1.1             |
| T1   | T2 (≠ T1) | T2 (first right)        | 5 → 6 (2.2)       | 3.1.2 / 3.2.1     |
| T1   | T2 (≠ T1) | T1, only if T2 declines | 5 → 6 (2.2)       | 3.2.2             |
| none | T         | T                       | 5 → 6 (2.2)       | 3.1.2 (ruling R1) |
| T1   | none (FA) | T1                      | 5 → 6 (2.2)       | 3.2.3             |
| none | none      | nobody                  | —                 | —                 |

A single player can therefore carry **two** claims at once: the rostering team's
unconditional claim and the drafting team's contingent claim (3.2.2). The app must show
both, marking the second as contingent.

## Worked examples (test fixtures)

Fixtures E1–E5 are verbatim from the league rules document; E6–E8 follow directly from
Rules 1 and 3.2.3.

- **E1 (3.1.1)** — Team 1 drafted Player in round 8; Player is on Team 1's final roster.
  → Team 1 may keep Player in round 8.
- **E2 (3.1.2)** — Team 2 drafted Player in round 8; Player is on Team 1's final roster.
  → Team 1 may keep Player in round 5.
- **E3 (3.1.2 overflow)** — Team 2 drafted Player in round 10; Player is on Team 1's final
  roster; Team 1 is keeping its own round-5 draftee at round 5 under 3.1.1.
  → Team 1 may keep Player in round 6.
- **E4 (3.2.1 blocks reclaim)** — Team 1 drafted Player in round 7; Player ended on Team 2's
  final roster; Team 2 keeps Player in round 5. → Team 1 is ineligible to keep Player.
- **E5 (3.2.2 reclaim at default cost)** — Team 1 drafted Player in round 11; Player ended on
  Team 2's final roster; Team 2 waives its right. → Team 1 keeps Player in round 5 (not 11).
- **E6 (1.1)** — Player was kept by any team last season. → Disqualified for every team.
- **E7 (1.2)** — Player was drafted in rounds 1–4 last season. → Disqualified for every team.
- **E8 (3.2.3)** — Team 1 drafted Player in round 9; Player is a free agent at season end.
  → Team 1 may keep Player at 5 → 6.

## Resolved rulings

Formerly open questions Q1–Q8; resolved by the commissioner on 2026-08-04. The engine
implements these as written.

- **R1 — Undrafted pickups are keepable.** A waiver/FA pickup who was never drafted, on a
  team's final roster, may be kept at 5 → 6 (literal Rule 3.1.2).
- **R2 — No slide past round 6.** Rounds 5 and 6 are the only default-cost slots. The app
  flags an over-allocation as a conflict rather than sliding to round 7. (With R3's cap
  this state is unreachable through normal selection; the engine still guards it.)
- **R3 — Maximum 2 keepers per team.** A hard league constant. The app does not read
  Sleeper's `max_keepers` setting.
- **R4 — Draft-pick trading is not supported.** The app does not model traded draft picks
  in the previous season's draft. If real data nonetheless contains two same-round
  draft-position keeps for one team, the app flags a conflict rather than guessing.
- **R5 — Reclaim rights survive trades.** Rule 3.2 is implemented literally: the drafting
  team holds the contingent claim however the player departed (trade, drop, waivers).
- **R6 — Upcoming-draft pick ownership is ignored.** Keeper costs name a round, not a
  specific owned pick. No traded-pick accounting in the upcoming draft.
- **R7 — Keeper detection is auto + manual.** Auto-detect from `is_keeper` flags and from
  pre-draft roster presence: the league pre-boards keepers, so a player who appeared on a
  roster but was never drafted that season and was not acquired after the draft started
  must have been kept (inferred from the season's transaction log, with trades ignored as
  entry events). A pre-draft add also marks a player as kept even when they appear in the
  draft — keepers may be drafted at their cost slot, which would otherwise make them look
  like ordinary picks. The user can always review, add, and remove previous-season keepers
  manually — manual entry is a first-class flow.
- **R8 — Snake/linear drafts only.** The rules are round-based; auction leagues get a
  clear unsupported-format error.
