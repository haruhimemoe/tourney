/**
 * @file src/standings.ts
 * @desc Group standings: points per win, loss and forfeit loss, then tiebreaks in order
 *       (head to head among the tied, map difference, maps won), then seed. Used by round robin
 *       groups and by swiss pairing.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import type { Match } from "./match.js";
import { fail, ok, type Result } from "./result.js";
import { checkEntrants, MAX_GROUP } from "./round-robin.js";

/** Tiebreaks, applied in the order listed after points. */
export const TIEBREAKS = ["head-to-head", "map-difference", "maps-won"] as const;

const points = z.number().int().min(-10).max(10);

/** How a group is ranked. */
export const StandingsRulesSchema = z.object({
  points: z.object({ win: points, loss: points, forfeitLoss: points }),
  tiebreaks: z.array(z.enum(TIEBREAKS)).max(TIEBREAKS.length),
});

/** How a group is ranked. */
export type StandingsRules = z.infer<typeof StandingsRulesSchema>;

/** One point a win, every tiebreak. */
export const DEFAULT_STANDINGS_RULES: StandingsRules = {
  points: { win: 1, loss: 0, forfeitLoss: 0 },
  tiebreaks: [...TIEBREAKS],
};

/** The parts of a match standings read. Only done and forfeit matches count. */
export type GroupMatch = Pick<Match, "a" | "b" | "status" | "scoreA" | "scoreB" | "winner">;

/** One row. `tied` means only seed order separated it from a neighbour. */
export type Standing = {
  entrantId: string;
  place: number;
  played: number;
  wins: number;
  losses: number;
  mapsWon: number;
  mapsLost: number;
  points: number;
  tied: boolean;
};

const counted = (m: GroupMatch): boolean =>
  (m.status === "done" || m.status === "forfeit") && m.winner !== null && !!m.a && !!m.b;

const pointsFor = (m: GroupMatch, id: string, rules: StandingsRules): number => {
  const side = m.a === id ? "a" : "b";
  if (m.winner === side) return rules.points.win;
  return m.status === "forfeit" ? rules.points.forfeitLoss : rules.points.loss;
};

/**
 * @function groupStandings
 * @param entrants {readonly string[]} the group in seed order
 * @param matches {readonly GroupMatch[]} its matches; unplayed ones are skipped
 * @param rules {StandingsRules} points and tiebreaks (default DEFAULT_STANDINGS_RULES)
 * @param extra {{ byes?: readonly string[] }} byes, each a win worth `points.win` with no maps
 * @returns {Result<Standing[]>} rows in place order, or bad-input for bad rules, a repeated
 *          entrant or a counted match naming someone outside the group
 */
export const groupStandings = (
  entrants: readonly string[],
  matches: readonly GroupMatch[],
  rules: StandingsRules = DEFAULT_STANDINGS_RULES,
  { byes = [] }: { byes?: readonly string[] } = {},
): Result<Standing[]> => {
  const checked = checkEntrants(entrants, 1, MAX_GROUP);
  if (!checked.ok) return checked;
  if (!StandingsRulesSchema.safeParse(rules).success) return fail("bad-input", "invalid rules");
  const rows = new Map<string, Standing>();
  for (const entrantId of entrants) {
    rows.set(entrantId, {
      entrantId,
      place: 0,
      played: 0,
      wins: 0,
      losses: 0,
      mapsWon: 0,
      mapsLost: 0,
      points: 0,
      tied: false,
    });
  }
  const played = matches.filter(counted);
  for (const m of played) {
    const a = rows.get(m.a as string);
    const b = rows.get(m.b as string);
    if (!a || !b || a === b) return fail("bad-input", `${m.a} v ${m.b} is not in this group`);
    for (const [row, side] of [
      [a, "a"],
      [b, "b"],
    ] as const) {
      row.played++;
      if (m.winner === side) row.wins++;
      else row.losses++;
      row.points += pointsFor(m, row.entrantId, rules);
      if (m.status === "done") {
        row.mapsWon += (side === "a" ? m.scoreA : m.scoreB) ?? 0;
        row.mapsLost += (side === "a" ? m.scoreB : m.scoreA) ?? 0;
      }
    }
  }
  for (const id of byes) {
    const row = rows.get(id);
    if (!row) return fail("bad-input", `bye for ${id}, who is not in this group`);
    row.wins++;
    row.points += rules.points.win;
  }

  const metric = (tb: (typeof TIEBREAKS)[number], ids: readonly string[], id: string): number => {
    const row = rows.get(id) as Standing;
    if (tb === "map-difference") return row.mapsWon - row.mapsLost;
    if (tb === "maps-won") return row.mapsWon;
    let sum = 0;
    for (const m of played) {
      if (
        (m.a === id || m.b === id) &&
        ids.includes(m.a as string) &&
        ids.includes(m.b as string)
      ) {
        sum += pointsFor(m, id, rules);
      }
    }
    return sum;
  };
  // Split a tied block by each tiebreak in turn; what is still tied falls back to seed order.
  const rank = (ids: string[], step: number): string[][] => {
    if (ids.length < 2 || step >= rules.tiebreaks.length) return [ids];
    const tb = rules.tiebreaks[step] as (typeof TIEBREAKS)[number];
    return splitBy(ids, (id) => metric(tb, ids, id)).flatMap((block) => rank(block, step + 1));
  };
  const blocks = splitBy([...entrants], (id) => (rows.get(id) as Standing).points).flatMap((b) =>
    rank(b, 0),
  );
  const out: Standing[] = [];
  for (const block of blocks) {
    for (const id of block) {
      const row = rows.get(id) as Standing;
      out.push({ ...row, place: out.length + 1, tied: block.length > 1 });
    }
  }
  return ok(out);
};

/** Groups ids by a value, highest first, keeping input (seed) order inside each group. */
const splitBy = (ids: readonly string[], value: (id: string) => number): string[][] => {
  const byValue = new Map<number, string[]>();
  for (const id of ids) {
    const v = value(id);
    byValue.set(v, [...(byValue.get(v) ?? []), id]);
  }
  return [...byValue.entries()].sort((x, y) => y[0] - x[0]).map(([, block]) => block);
};
