/**
 * @file src/bracket-wire.ts
 * @desc Bracket wiring: where each match's two sides come from (a seed, or the winner or loser
 *       of an earlier match). Matches are numbered M1.. in play order, so a source always points
 *       back at an earlier match.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { bracketSize, type Round } from "./ladder.js";
import { seedPositions } from "./seeding.js";

/** Where a side comes from. */
export const SourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("seed"), seed: z.number().int().positive() }),
  z.object({ kind: z.enum(["winner", "loser"]), match: z.string().min(1).max(16) }),
]);

/** Where a side comes from. */
export type Source = z.infer<typeof SourceSchema>;

/** One wired match before any results. */
export type WiredMatch = { code: string; round: string; a: Source; b: Source; bestOf: number };

type Pair = [Source, Source];

const pairUp = (codes: readonly string[], kind: "winner" | "loser"): Pair[] =>
  Array.from({ length: codes.length / 2 }, (_, j) => [
    { kind, match: codes[2 * j] as string },
    { kind, match: codes[2 * j + 1] as string },
  ]);

/**
 * @function dropOrder
 * @param count {number} matches in the losers round
 * @param drop {number} which drop-in round this is, from 1
 * @returns {number[]} for each losers match, the index of the winners match whose loser drops
 *          into it: reversed, then in order, then halves swapped, repeating
 */
export const dropOrder = (count: number, drop: number): number[] =>
  Array.from({ length: count }, (_, j) => {
    const mode = (drop - 1) % 3;
    if (mode === 0) return count - 1 - j;
    if (mode === 1) return j;
    return (j + Math.floor(count / 2)) % count;
  });

/**
 * @function wireBracket
 * @param size {number} entrants
 * @param rounds {readonly Round[]} the elimination rounds in play order (no qualifiers)
 * @returns {WiredMatch[]} every match in play order with its sources
 */
export const wireBracket = (size: number, rounds: readonly Round[]): WiredMatch[] => {
  const n = bracketSize(size);
  const k = Math.log2(n);
  const winners: string[][] = [];
  const losers: string[][] = [];
  const codes = new Map<string, string[]>();
  const out: WiredMatch[] = [];
  const at = (list: string[][], i: number): string[] => list[i] as string[];

  const feeds = (round: Round): Pair[] => {
    if (round.side === "winners") {
      const r = winners.length + 1;
      if (r === 1) {
        const seeds = seedPositions(n);
        return Array.from({ length: n / 2 }, (_, j) => [
          { kind: "seed", seed: seeds[2 * j] as number },
          { kind: "seed", seed: seeds[2 * j + 1] as number },
        ]);
      }
      return pairUp(at(winners, r - 2), "winner");
    }
    if (round.side === "losers") {
      const i = losers.length + 1;
      if (i === 1) return pairUp(at(winners, 0), "loser");
      const previous = at(losers, i - 2);
      if (i % 2 === 1) return pairUp(previous, "winner");
      const r = i / 2;
      const dropping = at(winners, r);
      const order = dropOrder(previous.length, r);
      return previous.map((code, j) => [
        { kind: "winner", match: code },
        { kind: "loser", match: dropping[order[j] as number] as string },
      ]);
    }
    if (round.side === "third") return pairUp(at(winners, k - 2), "loser");
    if (round.code === "GF") {
      const final = at(winners, k - 1)[0] as string;
      const lastLosers = losers.at(-1)?.[0];
      return [
        [
          { kind: "winner", match: final },
          lastLosers ? { kind: "winner", match: lastLosers } : { kind: "loser", match: final },
        ],
      ];
    }
    const gf = codes.get("GF")?.[0] as string;
    return [
      [
        { kind: "winner", match: gf },
        { kind: "loser", match: gf },
      ],
    ];
  };

  for (const round of rounds) {
    const list = feeds(round).map(([a, b]) => {
      const code = `M${out.length + 1}`;
      out.push({ code, round: round.code, a, b, bestOf: round.bestOf ?? 1 });
      return code;
    });
    codes.set(round.code, list);
    if (round.side === "winners") winners.push(list);
    if (round.side === "losers") losers.push(list);
  }
  return out;
};
