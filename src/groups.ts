/**
 * @file src/groups.ts
 * @desc Groups around a bracket: the group schema, snakeGroups (seeds snaked into groups) and
 *       seedsFromGroups (group placements to bracket seeds, so first rounds pair a group winner
 *       with a runner-up from another group, never two from one group where it can be helped).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { IdSchema } from "./ids.js";
import { bracketSize, MAX_ENTRANTS } from "./ladder.js";
import { fail, ok, type Result } from "./result.js";
import { checkEntrants, MAX_GROUP } from "./round-robin.js";
import { seedPositions } from "./seeding.js";

/** A group: its entrants in seed order. */
export const GroupSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(32),
  entrants: z.array(IdSchema).min(1).max(MAX_GROUP),
});

/** A group. */
export type Group = z.infer<typeof GroupSchema>;

/**
 * @function snakeGroups
 * @param entrants {readonly string[]} ids in seed order
 * @param count {number} how many groups
 * @returns {Result<string[][]>} each group in seed order: seeds 1..g go to groups 1..g, the next
 *          g back from g to 1, and so on; bad-input for a bad count or bad entrants
 */
export const snakeGroups = (entrants: readonly string[], count: number): Result<string[][]> => {
  const checked = checkEntrants(entrants, 1, MAX_ENTRANTS);
  if (!checked.ok) return checked;
  if (!Number.isSafeInteger(count) || count < 1 || count > entrants.length) {
    return fail("bad-input", "group count runs from 1 to the number of entrants");
  }
  const groups: string[][] = Array.from({ length: count }, () => []);
  for (const [i, id] of entrants.entries()) {
    const lap = Math.floor(i / count);
    const at = i % count;
    (groups[lap % 2 === 0 ? at : count - 1 - at] as string[]).push(id);
  }
  return ok(groups);
};

/**
 * @function seedsFromGroups
 * @param groups {readonly (readonly string[])[]} each group's entrants in place order
 * @param advance {number} how many go through from each group
 * @returns {Result<string[]>} bracket seed order for createBracket: every group's 1st in group
 *          order, then every 2nd, and so on; then each first-round pair from one group is fixed
 *          by swapping the lower seed with the first seed of the same placement that leaves both
 *          pairs mixed. bad-input for no groups, a bad advance, a group too small or a repeat
 */
export const seedsFromGroups = (
  groups: readonly (readonly string[])[],
  advance: number,
): Result<string[]> => {
  if (groups.length === 0) return fail("bad-input", "needs at least one group");
  if (!Number.isSafeInteger(advance) || advance < 1) {
    return fail("bad-input", "advance is a whole number from 1");
  }
  if (groups.some((g) => g.length < advance)) {
    return fail("bad-input", `every group needs ${advance} entrants`);
  }
  const seeds: string[] = [];
  const groupOf = new Map<string, number>();
  for (let place = 0; place < advance; place++) {
    for (const [g, group] of groups.entries()) {
      seeds.push(group[place] as string);
      groupOf.set(group[place] as string, g);
    }
  }
  const checked = checkEntrants(seeds, 2, MAX_ENTRANTS);
  if (!checked.ok) return checked;
  // First-round pairs by seed index; seeds past the field are byes and can't clash.
  const positions = seedPositions(bracketSize(seeds.length));
  const opponent = new Map<number, number>();
  for (let j = 0; j < positions.length; j += 2) {
    const x = (positions[j] as number) - 1;
    const y = (positions[j + 1] as number) - 1;
    opponent.set(x, y);
    opponent.set(y, x);
  }
  const group = (i: number) => groupOf.get(seeds[i] as string);
  const clash = (i: number) => {
    const o = opponent.get(i) as number;
    return o < seeds.length && group(i) === group(o);
  };
  const tier = (i: number) => Math.floor(i / groups.length);
  for (let i = 0; i < seeds.length; i++) {
    const o = opponent.get(i) as number;
    if (o < i || !clash(i)) continue;
    // Swap the lower seed (o) with a seed of the same placement when both pairs come out mixed.
    for (
      let s = tier(o) * groups.length;
      s < Math.min(seeds.length, (tier(o) + 1) * groups.length);
      s++
    ) {
      if (s === o) continue;
      [seeds[o], seeds[s]] = [seeds[s] as string, seeds[o] as string];
      if (!clash(o) && !clash(s)) break;
      [seeds[o], seeds[s]] = [seeds[s] as string, seeds[o] as string];
    }
  }
  return ok(seeds);
};
