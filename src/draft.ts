/**
 * @file src/draft.ts
 * @desc Captain drafts: pick order (snake or linear, worst or best seed first), who is on the
 *       clock, making a pick and the pick deadline.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { IdSchema, InstantSchema, OsuIdSchema } from "./ids.js";
import { fail, ok, type Result } from "./result.js";

/** One pick. */
export const DraftPickSchema = z.object({
  captain: IdSchema,
  player: OsuIdSchema,
  at: InstantSchema,
});

/** A draft: captains in seed order, picks so far. */
export const DraftSchema = z.object({
  order: z.enum(["snake", "linear"]),
  /** Round 1 starts with the last seed (EGC's reverse-start snake). */
  worstFirst: z.boolean(),
  captains: z.array(IdSchema).min(1).max(256),
  picksPerTeam: z.number().int().min(1).max(32),
  pickSeconds: z.number().int().positive(),
  picks: z.array(DraftPickSchema),
});

/** A draft. */
export type Draft = z.infer<typeof DraftSchema>;

/**
 * @function draftOrder
 * @param teams {number} captains, seeds 1..teams
 * @param picksPerTeam {number} picks each captain makes
 * @param opts {{ order: "snake" | "linear"; worstFirst: boolean }} the format
 * @returns {number[]} seeds in overall pick order, teams * picksPerTeam long; empty for a
 *          non-positive or non-integer count
 */
export const draftOrder = (
  teams: number,
  picksPerTeam: number,
  opts: { order: "snake" | "linear"; worstFirst: boolean },
): number[] => {
  if (!Number.isInteger(teams) || !Number.isInteger(picksPerTeam)) return [];
  const order: number[] = [];
  for (let round = 0; round < picksPerTeam; round++) {
    const flip = opts.order === "snake" && round % 2 === 1;
    const worst = opts.worstFirst !== flip;
    for (let i = 0; i < teams; i++) order.push(worst ? teams - i : i + 1);
  }
  return order;
};

/** Who picks next. */
export type OnTheClock = { overall: number; round: number; captain: string };

/**
 * @function onTheClock
 * @param draft {Draft} the draft
 * @returns {OnTheClock | null} the 0-based overall pick, its 1-based round and the captain, or
 *          null once every pick is made
 */
export const onTheClock = (draft: Draft): OnTheClock | null => {
  const order = draftOrder(draft.captains.length, draft.picksPerTeam, draft);
  const overall = draft.picks.length;
  const seed = order[overall];
  if (seed === undefined) return null;
  return {
    overall,
    round: Math.floor(overall / draft.captains.length) + 1,
    captain: draft.captains[seed - 1] as string,
  };
};

/**
 * @function makePick
 * @param draft {T} the draft
 * @param captain {string} the captain picking
 * @param player {number} the osu! id picked
 * @param ctx {{ pool: readonly number[]; now: Date }} players who may be drafted, and the time
 * @returns {Result<T>} the draft with the pick added, or closed (draft over), out-of-order (not
 *          this captain's turn) or bad-input (player not in the pool, already taken, bad time)
 */
export const makePick = <T extends Draft>(
  draft: T,
  captain: string,
  player: number,
  ctx: { pool: readonly number[]; now: Date },
): Result<T> => {
  const clock = onTheClock(draft);
  if (!clock) return fail("closed", "every pick is made");
  if (clock.captain !== captain) return fail("out-of-order", `${clock.captain} is on the clock`);
  if (!ctx.pool.includes(player)) return fail("bad-input", `${player} can't be drafted`);
  if (draft.picks.some((pick) => pick.player === player)) {
    return fail("bad-input", `${player} is already taken`);
  }
  if (Number.isNaN(ctx.now.getTime())) return fail("bad-input", "now is not a valid date");
  const pick = { captain, player, at: ctx.now.toISOString() };
  return ok({ ...draft, picks: [...draft.picks, pick] });
};

/**
 * @function pickDeadline
 * @param draft {Draft} the draft
 * @param startedAt {Date} when the draft started
 * @returns {Date | null} the last pick's time (or the start) plus pickSeconds; null when over
 */
export const pickDeadline = (draft: Draft, startedAt: Date): Date | null => {
  if (!onTheClock(draft)) return null;
  const last = draft.picks.at(-1);
  const from = last ? Date.parse(last.at) : startedAt.getTime();
  return new Date(from + draft.pickSeconds * 1000);
};
