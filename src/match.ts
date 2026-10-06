/**
 * @file src/match.ts
 * @desc The stored match record (sides, status, score, staff, links, pick/bans, maps, reschedules)
 *       and score helpers. The bracket holds progression; this holds what happened.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { IdSchema, InstantSchema, OsuIdSchema, type Side, SideSchema } from "./ids.js";
import { MAX_BEST_OF } from "./ladder.js";
import { fail, ok, type Result } from "./result.js";

/** Match statuses. */
export const MATCH_STATUSES = ["scheduled", "live", "done", "forfeit", "cancelled"] as const;

/** One step of the pick/ban phase. `slot` is a @haruhimemoe/pool slotKey. */
export const PickBanEntrySchema = z.object({
  side: SideSchema.nullable(),
  action: z.enum(["protect", "ban", "pick", "tiebreaker"]),
  slot: z.string().min(1).max(32),
});

/** One step of the pick/ban phase. */
export type PickBanEntry = z.infer<typeof PickBanEntrySchema>;

/** One player's score on one map. */
export const PlayerScoreSchema = z.object({
  osuId: OsuIdSchema,
  side: SideSchema,
  score: z.number().int().min(0),
  accuracy: z.number().min(0).max(1),
  maxCombo: z.number().int().min(0),
  misses: z.number().int().min(0),
  mods: z.array(z.string().min(1).max(8)).max(32),
  passed: z.boolean(),
});

/** One map played in a match. */
export const MapResultSchema = z.object({
  slot: z.string().min(1).max(32),
  winner: SideSchema.nullable(),
  warmup: z.boolean(),
  aborted: z.boolean(),
  lineupA: z.array(OsuIdSchema).max(16),
  lineupB: z.array(OsuIdSchema).max(16),
  scores: z.array(PlayerScoreSchema).max(64),
});

/** One map played. */
export type MapResult = z.infer<typeof MapResultSchema>;

/** One time change. `by` is null for staff or system changes. */
export const RescheduleSchema = z.object({
  from: InstantSchema.nullable(),
  to: InstantSchema,
  at: InstantSchema,
  by: OsuIdSchema.nullable(),
});

const url = z.url({ protocol: /^https?$/ });

/** A stored match. `a` / `b` are entrant ids, null while unknown. */
export const MatchSchema = z.object({
  id: IdSchema,
  /** The bracket match this record is, e.g. "M5". Null for a match outside the bracket. */
  bracketCode: z.string().min(1).max(16).nullable(),
  round: z.string().min(1).max(8),
  a: IdSchema.nullable(),
  b: IdSchema.nullable(),
  bestOf: z.number().int().min(1).max(MAX_BEST_OF),
  status: z.enum(MATCH_STATUSES),
  scheduledAt: InstantSchema.nullable(),
  scoreA: z.number().int().min(0).nullable(),
  scoreB: z.number().int().min(0).nullable(),
  winner: SideSchema.nullable(),
  mpLinks: z.array(url).max(8),
  streamUrl: url.nullable(),
  vodUrl: url.nullable(),
  refereeIds: z.array(OsuIdSchema).max(8),
  streamerIds: z.array(OsuIdSchema).max(8),
  commentatorIds: z.array(OsuIdSchema).max(8),
  pickBans: z.array(PickBanEntrySchema).max(64),
  maps: z.array(MapResultSchema).max(64),
  reschedules: z.array(RescheduleSchema).max(64),
  notes: z.string().max(4000).nullable(),
});

/** A stored match. */
export type Match = z.infer<typeof MatchSchema>;

/**
 * @function winsNeeded
 * @param bestOf {number} the best-of
 * @returns {number} maps a side must win
 */
export const winsNeeded = (bestOf: number): number => Math.ceil(bestOf / 2);

/**
 * @function checkScore
 * @param bestOf {number} the best-of
 * @param scoreA {number} maps side a won
 * @param scoreB {number} maps side b won
 * @returns {Result<Side>} the winner, or bad-score unless exactly one side reached the wins
 *          needed and the other is below it
 */
export const checkScore = (bestOf: number, scoreA: number, scoreB: number): Result<Side> => {
  const need = winsNeeded(bestOf);
  const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= need;
  if (!valid(scoreA) || !valid(scoreB)) return fail("bad-score", `scores run 0 to ${need}`);
  if (scoreA === need && scoreB < need) return ok("a");
  if (scoreB === need && scoreA < need) return ok("b");
  return fail("bad-score", `one side needs exactly ${need} wins`);
};

/**
 * @function scoreFromMaps
 * @param maps {readonly MapResult[]} maps played
 * @returns {{ a: number; b: number }} maps won per side, skipping warmups and aborted maps
 */
export const scoreFromMaps = (maps: readonly MapResult[]): { a: number; b: number } => {
  const score = { a: 0, b: 0 };
  for (const map of maps) {
    if (!map.warmup && !map.aborted && map.winner) score[map.winner]++;
  }
  return score;
};

/**
 * @function teamTotals
 * @param map {MapResult} one map
 * @returns {{ a: number; b: number }} the sum of each side's scores
 */
export const teamTotals = (map: MapResult): { a: number; b: number } => {
  const totals = { a: 0, b: 0 };
  for (const s of map.scores) totals[s.side] += s.score;
  return totals;
};
