/**
 * @file src/dropouts.ts
 * @desc Dropouts: forfeitWithdrawn forfeits every ready match a withdrawn entrant is in to the
 *       other side, in play order, so one pass also covers the matches those forfeits fill.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import type { Bracket, BracketMatch, BracketSide } from "./bracket.js";
import { reportForfeit } from "./bracket-report.js";
import { ok, type Result } from "./result.js";

/**
 * @function forfeitWithdrawn
 * @param bracket {Bracket} the bracket
 * @param withdrawn {readonly string[]} the entrants who dropped out
 * @returns {Result<{ bracket: Bracket; forfeited: string[] }>} the bracket with every ready
 *          match a withdrawn entrant is in forfeited to the other side (side a when both
 *          withdrew), and the codes forfeited in play order. A match still waiting for its other
 *          side is left alone, so call it again after each result
 */
export const forfeitWithdrawn = (
  bracket: Bracket,
  withdrawn: readonly string[],
): Result<{ bracket: Bracket; forfeited: string[] }> => {
  const out = new Set(withdrawn);
  const gone = (side: BracketSide) => side.entrant !== null && out.has(side.entrant);
  let current = bracket;
  const forfeited: string[] = [];
  // Play order: a forfeit only fills matches after it, so they are still ahead in this loop.
  for (let i = 0; i < current.matches.length; i++) {
    const m = current.matches[i] as BracketMatch;
    if (m.status !== "ready" || !(gone(m.a) || gone(m.b))) continue;
    const next = reportForfeit(current, m.code, gone(m.a) && !gone(m.b) ? "b" : "a");
    if (!next.ok) return next;
    current = next.value;
    forfeited.push(m.code);
  }
  return ok({ bracket: current, forfeited });
};
