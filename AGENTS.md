# AGENTS.md

`@haruhimemoe/tourney`: osu! tournaments as data. Schemas and pure functions only. Storage, routes, UI, Discord and payments live in the apps.

## Rules

- **Peers only.** `zod`, `@haruhimemoe/pool` and `@haruhimemoe/time` are peer dependencies, plus `@haruhimemoe/osu` as an optional peer that only `src/mp.ts` and `src/mp-sides.ts` may import (the root entry must never reach it). No network, no DOM, no Node-only APIs, no clock and no randomness in `src/`: callers pass `now` and ids.
- **Pure.** Functions never mutate their input and never throw for bad state; they return `{ ok: false, error }`.
- **Extendable.** Schemas carry no refinements (they would be lost on `.extend()`); cross-field checks live in functions.
- **Public API is pinned** by `tests/api.test.ts`. Adding or removing an export is a semver decision: say so in `CHANGELOG.md`.
- **Test first.** A behavior change starts as a failing case in the matching test file.
- **Changelog.** A change users can see gets a line under `## [Unreleased]` in `CHANGELOG.md`.
- **Releases are cut by the maintainers.** Don't bump the version, tag, push or publish unless a maintainer asks.
- Code style: Biome (2 spaces, double quotes, 100 columns). Every file starts with the `@file / @desc / @author / @created / @modified` header. Exported functions get a JSDoc block with `@function`, `@param` and `@returns`. Files under 250 lines.
- Imports inside `src/` use `.js` extensions (Node ESM).
- Docs are for their readers: `README.md` for users, `CONTRIBUTING.md` for contributors, this file for agents. No maintainer notes in any of them.

## Layout

| Path | What's there |
| --- | --- |
| `src/index.ts` | The root exports. |
| `src/mp.ts`, `src/mp-sides.ts` | The `/mp` entry: `fromOsuMatch` over `@haruhimemoe/osu/match`; which side a score is on. |
| `src/result.ts`, `src/ids.ts` | `Result`, error codes; id, osu! id, instant and side schemas. |
| `src/team.ts`, `src/tournament.ts` | Side rules, teams, lineups, names; tournament, phases, registration window. |
| `src/ladder.ts`, `src/seeding.ts` | Round ladders and codes; qualifier ranking, seed order. |
| `src/bracket-wire.ts`, `src/bracket.ts`, `src/bracket-report.ts` | Match sources; bracket schema, create and settle; results, clear, champion. |
| `src/match.ts`, `src/pickban.ts`, `src/pickban-phases.ts`, `src/roll.ts` | Stored match record, score helpers; pick/ban replay; phase order; rolls. |
| `src/placements.ts` | Standings from a bracket. |
| `src/round-robin.ts`, `src/standings.ts`, `src/swiss.ts`, `src/groups.ts` | Group schedules; standings and tiebreaks; swiss pairing; groups to a bracket. |
| `src/draft.ts`, `src/registration.ts`, `src/schedule.ts` | Drafts; registrations; suggested times and reschedules. |
| `tests/` | Vitest, one file per module, `egc2026` end to end, `api` pins the surface; `fixtures.ts` has helpers. |
| `scripts/smoke.mjs` | Imports the built package through its exports map (`bun run test:dist`). |
| `scripts/check-consumer.mjs` | Packs, installs with a given zod and the peers in a temp project, strict typecheck and run. |

## Before calling a change done

```sh
bun run check && bun run typecheck && bun run test && bun run test:dist
```
