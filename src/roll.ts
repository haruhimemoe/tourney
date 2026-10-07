/**
 * @file src/roll.ts
 * @desc Rolls: rollFirst turns two !roll values and the roll winner's choice into the first
 *       turns checkPickBans takes. A tie is a refusal; the sides reroll.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { otherSide, type Side } from "./ids.js";
import type { FirstTurns } from "./pickban.js";
import { fail, ok, type Result } from "./result.js";

/** Who takes each first turn: the roll winner or the roll loser. */
export type RollTaker = "winner" | "loser";

/** What the roll winner chose. `protect` defaults to whoever takes the first ban. */
export type RollChoice = { ban: RollTaker; pick: RollTaker; protect?: RollTaker };

/**
 * @function rollFirst
 * @param rolls {{ a: number; b: number }} each side's roll, an integer from 0
 * @param choice {RollChoice} what the roll winner took
 * @returns {Result<{ winner: Side; first: FirstTurns }>} the roll winner and the first turns, or
 *          bad-input (a roll that is not a whole number from 0, or a bad choice) or bad-state
 *          (a tie: reroll)
 */
export const rollFirst = (
  rolls: { a: number; b: number },
  choice: RollChoice,
): Result<{ winner: Side; first: FirstTurns }> => {
  const valid = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (!valid(rolls.a) || !valid(rolls.b)) return fail("bad-input", "rolls are whole numbers");
  const takers = [choice.ban, choice.pick, choice.protect ?? choice.ban];
  if (!takers.every((t) => t === "winner" || t === "loser")) {
    return fail("bad-input", "each first turn goes to the winner or the loser");
  }
  if (rolls.a === rolls.b) return fail("bad-state", "the rolls tied: reroll");
  const winner: Side = rolls.a > rolls.b ? "a" : "b";
  const side = (taker: RollTaker): Side => (taker === "winner" ? winner : otherSide(winner));
  const first: FirstTurns = { ban: side(choice.ban), pick: side(choice.pick) };
  if (choice.protect) first.protect = side(choice.protect);
  return ok({ winner, first });
};
