# Changelog

All notable changes to `@haruhimemoe/tourney` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-10-10

### Changed

- The `@haruhimemoe/osu` peer range takes 0.6 and 0.7 as well as 0.5.
- CI runs CodeQL and a gitleaks scan of the full git history, and Dependabot covers dependencies and pinned actions. Dependencies are on their latest versions.

## [0.2.0] - 2026-10-06

### Added

- Pick/ban phase order: `rules.phases` (`PickBanPhaseSchema`) for split bans and any other order, `pickBanPhases`, and `phase` in the replay state. The 0.1 `protects` / `bans` rules still work as shorthand and give the same results and refusals.
- `rollFirst`: two rolls and the roll winner's choice to the first turns; a tie is refused.
- Third place match in single elimination (`thirdPlace: true`, round `3RD`, before `F`).
- `placements`: standings from a bracket in both formats, filled in as rounds finish.
- `@haruhimemoe/tourney/mp`: `fromOsuMatch` reads an osu! multiplayer match (from `@haruhimemoe/osu`) into maps, score, winner and a problem list. `MapResultSchema` takes an optional `gameId`.
- Groups: `roundRobin`, `groupStandings` with points and tiebreaks (`StandingsRulesSchema`), `swissPairings` and `swissRounds`, `snakeGroups`, `seedsFromGroups`, `GroupSchema`.

### Changed

- `@haruhimemoe/osu` (0.5 or newer) is an optional peer dependency, needed only for `@haruhimemoe/tourney/mp`.
- `RoundSchema.side` can be `"third"`. Code that switches over every side needs a case for it.

## [0.1.0] - 2026-10-06

### Added

- Round ladders for single and double elimination (`buildLadder`): RO/QF/SF/F, losers rounds, grand final with optional reset, qualifiers, best-of per round.
- Brackets with progression (`createBracket`, `reportResult`, `reportForfeit`, `clearResult`, `champion`): standard seeding, byes, losers bracket drops, grand final reset.
- Qualifier ranking by total score or average rank (`rankQualifiers`), and standard seed order (`seedPositions`).
- Stored match records (`MatchSchema`) with maps, per-player scores, lineups, staff, links and reschedules; score helpers.
- Pick/ban replay against a `@haruhimemoe/pool` pool (`checkPickBans`): protects, bans, picks, tiebreaker, whose turn is next.
- Teams with rosters, subs and per-map lineups; solo sides.
- Captain drafts: snake or linear order, the clock, picks, deadlines.
- Tournaments with phases and a registration window; registrations with review, role conflicts and caps.
- Scheduling through `@haruhimemoe/time` (`suggestMatchTimes`) and reschedule rules (`checkReschedule`).

[unreleased]: https://github.com/haruhimemoe/tourney/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/haruhimemoe/tourney/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/haruhimemoe/tourney/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/haruhimemoe/tourney/releases/tag/v0.1.0
