/**
 * @file src/round-robin.ts
 * @desc Round robin schedules by the circle method: every pair meets once per leg, an odd count
 *       gives one bye per round, and the fixed entrant switches sides each round.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { IdSchema } from "./ids.js";
import { fail, ok, type Result } from "./result.js";

/** Most entrants in one round robin group. */
export const MAX_GROUP = 64;

/** One round of a group schedule. `bye` sits the round out (odd counts only). */
export type GroupRound = { round: number; matches: { a: string; b: string }[]; bye: string | null };

/**
 * @function checkEntrants
 * @param entrants {readonly string[]} ids
 * @param min {number} fewest allowed
 * @param max {number} most allowed
 * @returns {Result<true>} ok, or bad-input for a bad id, a repeat or a count out of range
 */
export const checkEntrants = (
  entrants: readonly string[],
  min: number,
  max: number,
): Result<true> => {
  if (entrants.length < min || entrants.length > max) {
    return fail("bad-input", `takes ${min} to ${max} entrants`);
  }
  if (entrants.some((id) => !IdSchema.safeParse(id).success)) {
    return fail("bad-input", "every entrant needs an id");
  }
  if (new Set(entrants).size !== entrants.length) {
    return fail("bad-input", "an entrant is listed twice");
  }
  return ok(true);
};

/**
 * @function roundRobin
 * @param entrants {readonly string[]} 2 to 64 ids, in seed order
 * @param options {{ legs?: 1 | 2 }} two legs repeat the schedule with sides swapped
 * @returns {Result<GroupRound[]>} the rounds, numbered from 1, or bad-input
 */
export const roundRobin = (
  entrants: readonly string[],
  { legs = 1 }: { legs?: 1 | 2 } = {},
): Result<GroupRound[]> => {
  const checked = checkEntrants(entrants, 2, MAX_GROUP);
  if (!checked.ok) return checked;
  if (legs !== 1 && legs !== 2) return fail("bad-input", "legs is 1 or 2");
  const ring: (string | null)[] = [...entrants];
  if (ring.length % 2 === 1) ring.push(null);
  const n = ring.length;
  const rounds: GroupRound[] = [];
  for (let r = 0; r < n - 1; r++) {
    // Seat 0 stays; the others turn one place each round.
    const seats = [
      ring[0],
      ...Array.from({ length: n - 1 }, (_, i) => ring[1 + ((i + r) % (n - 1))]),
    ];
    const matches: { a: string; b: string }[] = [];
    let bye: string | null = null;
    for (let i = 0; i < n / 2; i++) {
      const x = seats[i] as string | null;
      const y = seats[n - 1 - i] as string | null;
      if (x === null || y === null) {
        bye = x ?? y;
        continue;
      }
      const flip = i === 0 ? r % 2 === 1 : i % 2 === 1;
      matches.push(flip ? { a: y, b: x } : { a: x, b: y });
    }
    rounds.push({ round: r + 1, matches, bye });
  }
  if (legs === 2) {
    const back = rounds.map((round) => ({
      round: round.round + rounds.length,
      matches: round.matches.map(({ a, b }) => ({ a: b, b: a })),
      bye: round.bye,
    }));
    rounds.push(...back);
  }
  return ok(rounds);
};
