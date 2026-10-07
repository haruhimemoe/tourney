/**
 * @file src/swiss.ts
 * @desc Swiss: pair one round from the standings without rematches. Entrants on the same points
 *       fold (top half against bottom half: 1 v 5, 2 v 6 in a group of eight), and a group that
 *       can't pair floats down. With an odd count the lowest-ranked entrant without a bye sits
 *       out. Backtracks, with a step cap.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { fail, ok, type Result } from "./result.js";
import { checkEntrants, MAX_GROUP } from "./round-robin.js";
import {
  DEFAULT_STANDINGS_RULES,
  type GroupMatch,
  groupStandings,
  type StandingsRules,
} from "./standings.js";

/** Most backtracking steps before swissPairings gives up. */
const MAX_STEPS = 200_000;

/** One swiss round: who plays whom (the higher-ranked entrant is side a) and who sits out. */
export type SwissRound = { pairs: { a: string; b: string }[]; bye: string | null };

/** What swissPairings takes. `round` counts from 1; `rounds` is the fixed total. */
export type SwissOptions = { round: number; rounds: number; rules?: StandingsRules };

/**
 * @function swissRounds
 * @param entrants {number} how many play
 * @returns {number} the usual round count, enough to leave one unbeaten: ceil(log2 n), at least 1
 */
export const swissRounds = (entrants: number): number =>
  Math.max(1, Math.ceil(Math.log2(Math.max(2, entrants))));

/**
 * @function swissPairings
 * @param entrants {readonly string[]} 2 to 64 ids in seed order
 * @param history {{ matches: readonly GroupMatch[]; byes: readonly string[] }} rounds so far
 * @param options {SwissOptions} this round, the total and the standings rules
 * @returns {Result<SwissRound>} the pairs and the bye, or bad-input (bad entrants, rules or
 *          history), limit (past the last round) or bad-state (no pairing without a rematch)
 */
export const swissPairings = (
  entrants: readonly string[],
  history: { matches: readonly GroupMatch[]; byes: readonly string[] },
  { round, rounds, rules = DEFAULT_STANDINGS_RULES }: SwissOptions,
): Result<SwissRound> => {
  const checked = checkEntrants(entrants, 2, MAX_GROUP);
  if (!checked.ok) return checked;
  if (!Number.isSafeInteger(rounds) || rounds < 1 || !Number.isSafeInteger(round) || round < 1) {
    return fail("bad-input", "round and rounds count from 1");
  }
  if (round > rounds) return fail("limit", `round ${round} is past the last round, ${rounds}`);
  const table = groupStandings(entrants, history.matches, rules, { byes: history.byes });
  if (!table.ok) return table;
  const ranked = table.value.map((row) => row.entrantId);
  const points = new Map(table.value.map((row) => [row.entrantId, row.points]));
  const met = new Set<string>();
  for (const m of history.matches) if (m.a && m.b) met.add(key(m.a, m.b));

  const steps = { left: MAX_STEPS };
  const byeOrder = [...ranked].reverse();
  const hadBye = (id: string) => history.byes.includes(id);
  const candidates =
    ranked.length % 2 === 0
      ? [null]
      : [...byeOrder.filter((id) => !hadBye(id)), ...byeOrder.filter(hadBye)];
  for (const bye of candidates) {
    const field = ranked.filter((id) => id !== bye);
    const pairs = pairUp(field, points, met, steps);
    if (pairs) return ok({ pairs, bye });
    if (steps.left <= 0) break;
  }
  return fail("bad-state", "no pairing avoids a rematch");
};

const key = (a: string, b: string): string => (a < b ? `${a}\n${b}` : `${b}\n${a}`);

/** Pairs the field top down; the top entrant tries its fold partner first, then the rest. */
const pairUp = (
  field: readonly string[],
  points: ReadonlyMap<string, number>,
  met: ReadonlySet<string>,
  steps: { left: number },
): { a: string; b: string }[] | null => {
  if (field.length === 0) return [];
  if (--steps.left <= 0) return null;
  const [top, ...rest] = field as [string, ...string[]];
  const same = rest.filter((id) => points.get(id) === points.get(top));
  const lower = rest.filter((id) => points.get(id) !== points.get(top));
  const half = Math.floor(same.length / 2);
  const order = [...same.slice(half), ...same.slice(0, half), ...lower];
  for (const other of order) {
    if (met.has(key(top, other))) continue;
    const tail = pairUp(
      rest.filter((id) => id !== other),
      points,
      met,
      steps,
    );
    if (tail) return [{ a: top, b: other }, ...tail];
    if (steps.left <= 0) return null;
  }
  return null;
};
