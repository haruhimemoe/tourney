/**
 * @file src/index.ts
 * @desc The root exports of @haruhimemoe/tourney: osu! tournaments as data. The mp link bridge
 *       is @haruhimemoe/tourney/mp (src/mp.ts), so osu is only needed by apps that use it.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

export * from "./bracket.js";
export * from "./bracket-report.js";
export {
  dropOrder,
  type Source,
  SourceSchema,
  type WiredMatch,
  wireBracket,
} from "./bracket-wire.js";
export * from "./draft.js";
export * from "./groups.js";
export * from "./ids.js";
export {
  type BestOfInput,
  bracketSize,
  buildLadder,
  type Format,
  FormatSchema,
  type LadderOptions,
  MAX_BEST_OF,
  MAX_ENTRANTS,
  type Round,
  RoundSchema,
  winnersCode,
} from "./ladder.js";
export * from "./match.js";
export * from "./pickban.js";
export {
  MAX_PHASES,
  type PickBanPhase,
  PickBanPhaseSchema,
  pickBanPhases,
} from "./pickban-phases.js";
export * from "./placements.js";
export * from "./registration.js";
export type { Result, TourneyError, TourneyErrorCode } from "./result.js";
export * from "./roll.js";
export { type GroupRound, MAX_GROUP, roundRobin } from "./round-robin.js";
export * from "./schedule.js";
export * from "./seeding.js";
export * from "./standings.js";
export * from "./swiss.js";
export * from "./team.js";
export * from "./tournament.js";
