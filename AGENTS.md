# AGENTS.md

`@haruhimemoe/tourney`: osu! tournaments as data. Schemas and pure functions only. Storage, routes, UI, Discord and payments live in the apps.

## Rules

- **Peers only.** `zod`, `@haruhimemoe/pool`, `@haruhimemoe/osu` and `@haruhimemoe/time` are peer dependencies, nothing else. No network, no DOM, no Node-only APIs, no clock and no randomness in `src/`: callers pass `now` and ids.
- **Pure.** Functions never mutate their input and never throw for bad state; they return `{ ok: false, error }`.
- **Extendable.** Schemas carry no refinements (they would be lost on `.extend()`); cross-field checks live in functions.
- **Test first.** A behavior change starts as a failing case in the matching test file.
- **Changelog.** A change users can see gets a line under `## [Unreleased]` in `CHANGELOG.md`.
- **Releases are cut by the maintainers.** Don't bump the version, tag, push or publish unless a maintainer asks.
- Code style: Biome (2 spaces, double quotes, 100 columns). Every file starts with the `@file / @desc / @author / @created / @modified` header. Exported functions get a JSDoc block with `@function`, `@param` and `@returns`. Files under 250 lines.
- Imports inside `src/` use `.js` extensions (Node ESM).
- Docs are for their readers: `README.md` for users, `CONTRIBUTING.md` for contributors, this file for agents. No maintainer notes in any of them.

## Before calling a change done

```sh
bun run check && bun run typecheck && bun run test && bun run build
```
