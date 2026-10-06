# Changelog

All notable changes to `@haruhimemoe/tourney` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/haruhimemoe/tourney/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/haruhimemoe/tourney/releases/tag/v0.1.0
