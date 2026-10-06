# @haruhimemoe/tourney

osu! tournaments as data. Zod schemas and pure functions for tournaments, round ladders, brackets with progression, matches, pick/ban logs, teams with subs, captain drafts, registration and scheduling.

There is no storage, network, clock or UI in here. You keep the records (in Mongo or anywhere else), pass `now` and ids in, and get new values or a refusal back. Pools come from [`@haruhimemoe/pool`](https://github.com/haruhimemoe/pool) (pick/ban logs point at its `slotKey`) and availability from [`@haruhimemoe/time`](https://github.com/haruhimemoe/time). ESM for Node 22.12+, Bun, Deno, browsers and bundlers.

## Install

```sh
bun add @haruhimemoe/tourney @haruhimemoe/pool @haruhimemoe/time zod
```

`zod` (4.0.16 or newer), `@haruhimemoe/pool` and `@haruhimemoe/time` are peer dependencies.

## Quick start

```ts
import { champion, createBracket, rankQualifiers, reportResult } from "@haruhimemoe/tourney";

const seeds = rankQualifiers(
  [
    { entrantId: "moss", scores: [812_000, 640_500, null] },
    { entrantId: "fern", scores: [790_100, 701_200, 655_000] },
    { entrantId: "pine", scores: [500_000, 510_000, 520_000] },
  ],
  "average-rank",
);

const created = createBracket({
  entrants: seeds.map((s) => s.entrantId), // seed order
  format: "double",
  bestOf: { default: 7, rounds: { GF: 9 } },
  grandFinalReset: true,
});
if (!created.ok) throw new Error(created.error.message);

let bracket = created.value; // byes are already played out
const next = reportResult(bracket, "M2", { scoreA: 4, scoreB: 1 });
if (next.ok) bracket = next.value;

champion(bracket); // null until the last final is played
```

Functions that can refuse return `{ ok: true, value }` or `{ ok: false, error: { code, message } }`. None of them mutate their input. Codes: `bad-input`, `bad-state`, `bad-side`, `bad-score`, `bad-slot`, `out-of-order`, `limit`, `not-found`, `closed`.

## Entrants and sides

The bracket and matches name one **entrant** per side: in a 1v1 tourney the player's osu! id as a string, in a team tourney the team id. Any non-empty string up to 128 characters works as an id (Mongo ObjectId strings included).

`SideRules` says how a side is made up: `kind` (`"solo"` or `"team"`), `lineup` (players per map), `rosterMin`, `rosterMax` and `subsMax`. A team has a `captainId`, a `roster` and `subs`. The lineup for a map is drawn from both.

| Function | Does |
| --- | --- |
| `checkSideRules(rules)` | refuses rules that can't be met |
| `checkTeam(team, rules)` | valid rules, captain on the roster, nobody twice, roster and subs in range |
| `checkLineup(team, lineup, rules)` | right size, no repeats, everyone on the roster or subs |
| `teamNameKey(name)` | trimmed, collapsed, lower-case name for comparing |
| `uniqueTeamName(name, taken)` | `name` ("Team" when blank), or `name 2`, `name 3`, cut to 32 characters |

## Ladders

`buildLadder({ size, format, qualifiers, bestOf, grandFinalReset? })` returns the rounds in play order: `{ code, name, side, order, bestOf }`.

- Winners rounds are `RO<n>` while 16 or more are left, then `QF`, `SF`, `F`. In double elimination `F` is the winners final.
- Losers rounds are `LR1` to `LR<2(k-1)>` for a bracket of `2^k`. Then `GF`, and `GFR` with `grandFinalReset`.
- `Q` comes first with `qualifiers: true` and has no best-of.
- Play order: the first winners round, then each next winners round before the two losers rounds it feeds.
- `bestOf` is a number, or `{ default, rounds: { SF: 9, GF: 13 } }`. Every value must be odd, 1 to 25.
- `size` is 2 to 256 entrants. Byes fill up to the next power of two.

A 16-team double elimination with qualifiers gives `Q, RO16, QF, LR1, LR2, SF, LR3, LR4, F, LR5, LR6, GF`.

## Brackets

`createBracket({ entrants, format, bestOf, grandFinalReset? })` takes entrant ids in seed order and returns a `Bracket`: the `entrants`, the `rounds` (no `Q`), and `matches` numbered `M1`, `M2`, and so on in play order.

Each match side has a `source` (`{ kind: "seed", seed }`, or `{ kind: "winner" | "loser", match }`), the `entrant` once known, and `settled`. Match `status` is one of:

| Status | Means |
| --- | --- |
| `pending` | a side is still unknown |
| `ready` | both sides known, waiting for a result |
| `done` | played, with scores and a `winner` |
| `forfeit` | decided without scores |
| `bye` | a side is empty; the other side goes through (no winner if both are empty) |
| `skipped` | the bracket reset, when the winners side took the grand final |

Seeds are placed in standard order (1 and 2 can only meet in the final). In double elimination, losers drop into the losers bracket in an order that cycles reversed, straight, halves swapped, to cut down early rematches. If the losers side wins `GF`, `GFR` becomes `ready` with the same two entrants.

| Function | Does |
| --- | --- |
| `reportResult(bracket, code, { scoreA, scoreB })` | a `ready` match; the winner must reach `ceil(bestOf / 2)` |
| `reportForfeit(bracket, code, winner)` | a `ready` match, decided without scores |
| `clearResult(bracket, code)` | undoes a result; refused while a later match fed by it (directly or through byes) has one |
| `champion(bracket)` | the winner of the last final played, else null |
| `matchesFor(bracket, id)` / `nextMatch(bracket, id)` | an entrant's matches / their `ready` match |
| `settleBracket(bracket)` | refills sides and statuses after you edit a bracket by hand; drops a result whose players are no longer known |

`BracketSchema` parses a stored bracket.

## Seeding

- `rankQualifiers(rows, method)`: rows are `{ entrantId, scores }`, one score per qualifier map, `null` (or a non-finite number) for no score. `"sum"` ranks by total score. `"average-rank"` ranks by mean rank per map (null ranks last). Equal values keep input order and come back with `tied: true`.
- `seedPositions(n)`: the standard first-round order for `n` (a power of two), e.g. `1, 8, 4, 5, 2, 7, 3, 6`.

## Matches

`MatchSchema` is the stored record of one match. It holds:

- sides and `bracketCode`
- status, scores and winner
- `mpLinks`, `streamUrl` and `vodUrl` (http and https only)
- referees, streamers and commentators by osu! id
- `pickBans`, the pick/ban log
- `maps`: the slot, winner, warmup and aborted flags, both lineups, and each player's score, accuracy, combo, misses, mods and pass
- `reschedules` and `notes`

| Function | Does |
| --- | --- |
| `winsNeeded(bestOf)` | maps a side must win |
| `checkScore(bestOf, a, b)` | the winning side, or `bad-score` |
| `scoreFromMaps(maps)` | maps won per side, skipping warmups and aborted maps |
| `teamTotals(map)` | summed scores per side on one map |

## Pick/ban

A log is a list of `{ side, action, slot }`. `action` is `protect`, `ban`, `pick` or `tiebreaker`. `slot` is a `@haruhimemoe/pool` `slotKey`, so custom buckets work.

```ts
checkPickBans(log, {
  pool, // a @haruhimemoe/pool pool (only `slots` is read)
  rules: { protects: 1, bans: 2, tiebreaker: slotKey({ mod: "TB", index: 1 }) },
  bestOf: 9,
  first: { ban: "a", pick: "b" }, // what the roll decided; protect defaults to ban
  score: { a: 3, b: 2 }, // optional
});
```

It replays the log and returns `{ protected, banned, picked, tiebreaker, remaining, next }`. `next` is whose turn it is and what to do, for a referee view. It is null once the tiebreaker is played or, with `score`, once a side has won. The log is refused when:

- a slot is not in the pool, or not free (`bad-slot`)
- an entry is out of phase (every protect, then every ban, then picks) or out of turn (`out-of-order`)
- a side goes over its protects or bans, or there are more than `bestOf - 1` picks (`limit`)
- a side bans a protected slot (its own or the other side's) (`bad-slot`). Protected slots can still be picked.
- with `score` given and a side already through, there are more picks than maps played (`bad-state`)
- the rules, best-of or first turns are invalid (`bad-input`)
- the tiebreaker is used anywhere but as one last entry with no side, after `bestOf - 1` picks, at a tie when `score` is given (`bad-state`)

## Drafts

`DraftSchema`: `order` (`snake` or `linear`), `worstFirst`, `captains` in seed order, `picksPerTeam`, `pickSeconds` and `picks`.

| Function | Does |
| --- | --- |
| `draftOrder(teams, picksPerTeam, { order, worstFirst })` | seeds in overall pick order |
| `onTheClock(draft)` | `{ overall, round, captain }`, or null when done |
| `makePick(draft, captain, player, { pool, now })` | adds a pick: right captain, player in `pool`, not taken |
| `pickDeadline(draft, startedAt)` | last pick (or start) plus `pickSeconds` |

## Tournaments and registration

`TournamentSchema` holds:

- `name`, `code`, `mode` and `phase`
- the `sides` rules
- the `registration` window and caps

Phases run `setup`, `registration`, `qualifiers`, `draft`, `bracket`, `done`. `advancePhase` only moves forward and may skip phases.

`RegistrationSchema` holds:

- `osuId` and `kind` (`player` or `staff`)
- `status`
- `appliedRoles` and `approvedRoles`
- `availability` (a `@haruhimemoe/time` grid) and `createdAt`

| Function | Does |
| --- | --- |
| `isRegistrationOpen(tournament, now)` | in the registration phase and window |
| `canRegister(tournament, kind, counts, now)` | window open and cap not reached |
| `reviewRegistration(registration, to)` | pending to approved, waitlisted, rejected or withdrawn; waitlisted to approved, rejected or withdrawn; approved to withdrawn. Approving staff with no approved roles copies the applied ones |
| `checkRoleConflicts(registrations, conflicts?)` | clashing role pairs one person holds; by default playing clashes with `mappooler` and `playtester` |

## Scheduling

- `suggestMatchTimes({ a, b, window, lengthMinutes, staff?, staffNeed?, limit? })` asks `@haruhimemoe/time` for the best starts in the round's window. Each side is `{ id, seed, members }`. On a tie, the start with more of the higher seed's players free wins.
- `checkReschedule(match, to, { window, maxReschedules, minNoticeHours }, now)` refuses a new time when:
  - the match is not `scheduled`
  - the time is outside the window
  - the request is too close to the old or new time
  - it would go over the limit (the first scheduling, with no `from`, doesn't count)

Agreeing on the new time is an invite, see [`@haruhimemoe/invites`](https://github.com/haruhimemoe/invites).

## License

MIT
