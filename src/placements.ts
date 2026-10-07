/**
 * @file src/placements.ts
 * @desc Final standings from a bracket. Each entrant ranks by the last match they played (its
 *       round's play order, then won over lost), so losers of the same round share a place, a
 *       third place match splits 3rd and 4th, and a double elimination losers bracket gives 3rd,
 *       4th, 5th and so on. Places fill in as rounds finish.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { type Bracket, type BracketMatch, hasResult } from "./bracket.js";
import { matchesFor } from "./bracket-report.js";

/** One entrant's place, null while it can still change. */
export type Placement = { entrantId: string; place: number | null };

const FINISHED = new Set(["done", "forfeit", "bye", "skipped"]);

const finished = (match: BracketMatch): boolean => FINISHED.has(match.status);

/**
 * @function placements
 * @param bracket {Bracket} the bracket, at any point
 * @returns {Placement[]} every entrant, by place (ties share one, like 5th for every QF loser),
 *          then seed; null for an entrant with a match left, or whose last round is unfinished
 */
export const placements = (bracket: Bracket): Placement[] => {
  const order = new Map(bracket.rounds.map((round) => [round.code, round.order]));
  const roundDone = (code: string): boolean =>
    bracket.matches.every((m) => m.round !== code || finished(m));
  const keys = new Map<string, number | null>();
  for (const id of bracket.entrants) {
    const mine = matchesFor(bracket, id);
    const last = mine.filter((m) => hasResult(m) || m.status === "bye").at(-1);
    if (!last || !mine.every(finished) || !roundDone(last.round)) {
      keys.set(id, null);
      continue;
    }
    const won = last.winner !== null && last[last.winner].entrant === id;
    keys.set(id, 2 * (order.get(last.round) ?? 0) + (won ? 1 : 0));
  }
  const open = [...keys.values()].filter((key) => key === null).length;
  const rows = bracket.entrants.map((entrantId) => {
    const key = keys.get(entrantId) ?? null;
    if (key === null) return { entrantId, place: null };
    let above = open;
    for (const other of keys.values()) if (other !== null && other > key) above++;
    return { entrantId, place: above + 1 };
  });
  return rows
    .map((row, seed) => ({ row, seed }))
    .sort((x, y) => (x.row.place ?? Infinity) - (y.row.place ?? Infinity) || x.seed - y.seed)
    .map(({ row }) => row);
};
