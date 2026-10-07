/**
 * @file src/ladder.ts
 * @desc Round ladders for single and double elimination: round codes, names, play order and
 *       best-of per round. RO<n> while 16 or more are left, then QF, SF, F; 3RD (third place,
 *       single only) right before F; LR1.. for the losers bracket; GF and GFR (bracket reset); Q
 *       for qualifiers.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { fail, ok, type Result } from "./result.js";

/** Elimination formats. */
export const FormatSchema = z.enum(["single", "double"]);

/** An elimination format. */
export type Format = z.infer<typeof FormatSchema>;

/** Most entrants a bracket takes. */
export const MAX_ENTRANTS = 256;

/** Longest best-of. */
export const MAX_BEST_OF = 25;

/** One round of the ladder. `order` is play order from 0; `bestOf` is null for qualifiers. */
export const RoundSchema = z.object({
  code: z.string().min(1).max(8),
  name: z.string().min(1).max(64),
  side: z.enum(["qualifiers", "winners", "losers", "grand", "third"]),
  order: z.number().int().min(0),
  bestOf: z.number().int().min(1).max(MAX_BEST_OF).nullable(),
});

/** One round. */
export type Round = z.infer<typeof RoundSchema>;

/** Best-of for every round, or a default with per-round overrides keyed by code. */
export type BestOfInput = number | { default: number; rounds?: Readonly<Record<string, number>> };

/** What buildLadder takes. */
export type LadderOptions = {
  /** Entrants, 2 to 256. Byes fill up to the next power of two. */
  size: number;
  format: Format;
  qualifiers: boolean;
  bestOf: BestOfInput;
  /** Double elimination only: add GFR, played when the losers side wins GF. */
  grandFinalReset?: boolean;
  /** Single elimination only: add 3RD, the SF losers, played right before F. */
  thirdPlace?: boolean;
};

/**
 * @function bracketSize
 * @param size {number} entrants
 * @returns {number} the next power of two at or above size (at least 2)
 */
export const bracketSize = (size: number): number => {
  let n = 2;
  while (n < size) n *= 2;
  return n;
};

/**
 * @function winnersCode
 * @param left {number} entrants left in the winners bracket at that round
 * @returns {string} RO<left> for 16 or more, else QF, SF or F
 */
export const winnersCode = (left: number): string =>
  left >= 16 ? `RO${left}` : left === 8 ? "QF" : left === 4 ? "SF" : "F";

const WINNERS_NAMES: Record<string, string> = { QF: "Quarterfinals", SF: "Semifinals" };

const winnersName = (code: string, format: Format): string =>
  code === "F"
    ? format === "double"
      ? "Winners Final"
      : "Final"
    : (WINNERS_NAMES[code] ?? `Round of ${code.slice(2)}`);

/**
 * @function ladderShape
 * @param size {number} entrants
 * @param format {Format} the format
 * @param grandFinalReset {boolean} add GFR
 * @param thirdPlace {boolean} single elimination: add 3RD before F when there are semifinals
 * @returns {Omit<Round, "order" | "bestOf">[]} the elimination rounds in play order: WB1, then
 *          each WB r+1 before LR 2r-1 and LR 2r, then GF and GFR; in single elimination WB1 to
 *          F with 3RD right before F
 */
export const ladderShape = (
  size: number,
  format: Format,
  grandFinalReset: boolean,
  thirdPlace = false,
): Omit<Round, "order" | "bestOf">[] => {
  const n = bracketSize(size);
  const k = Math.log2(n);
  const wb = (r: number) => {
    const code = winnersCode(n / 2 ** (r - 1));
    return { code, name: winnersName(code, format), side: "winners" as const };
  };
  const lr = (i: number) => ({
    code: `LR${i}`,
    name: `Losers Round ${i}`,
    side: "losers" as const,
  });
  if (format === "single") {
    const rounds = Array.from({ length: k }, (_, i) => wb(i + 1));
    if (!thirdPlace || k < 2) return rounds;
    const third = { code: "3RD", name: "Third Place", side: "third" as const };
    return [...rounds.slice(0, -1), third, ...rounds.slice(-1)];
  }
  const rounds: Omit<Round, "order" | "bestOf">[] = [wb(1)];
  for (let r = 1; r < k; r++) rounds.push(wb(r + 1), lr(2 * r - 1), lr(2 * r));
  rounds.push({ code: "GF", name: "Grand Final", side: "grand" });
  if (grandFinalReset) rounds.push({ code: "GFR", name: "Grand Final Reset", side: "grand" });
  return rounds;
};

const isBestOf = (n: number): boolean =>
  Number.isInteger(n) && n >= 1 && n <= MAX_BEST_OF && n % 2 === 1;

/**
 * @function buildLadder
 * @param opts {LadderOptions} entrants, format, qualifiers, best-of and reset
 * @returns {Result<Round[]>} the rounds in play order, or bad-input for a size outside 2..256, an
 *          even or out-of-range best-of, or a best-of key that is not an elimination round.
 *          `grandFinalReset` only applies to double elimination, `thirdPlace` only to single
 */
export const buildLadder = (opts: LadderOptions): Result<Round[]> => {
  const { size, format, bestOf } = opts;
  if (!Number.isInteger(size) || size < 2 || size > MAX_ENTRANTS) {
    return fail("bad-input", `size must be 2 to ${MAX_ENTRANTS}`);
  }
  const shape = ladderShape(
    size,
    format,
    format === "double" && opts.grandFinalReset === true,
    format === "single" && opts.thirdPlace === true,
  );
  const base = typeof bestOf === "number" ? bestOf : bestOf.default;
  const overrides = typeof bestOf === "number" ? {} : (bestOf.rounds ?? {});
  if (!isBestOf(base)) return fail("bad-input", "best-of must be an odd number from 1 to 25");
  const codes = new Set(shape.map((round) => round.code));
  for (const [code, n] of Object.entries(overrides)) {
    if (!codes.has(code)) return fail("bad-input", `${code} is not a round of this ladder`);
    if (!isBestOf(n)) return fail("bad-input", `${code}: best-of must be odd, 1 to 25`);
  }
  const rounds: Round[] = shape.map((round) => ({
    ...round,
    order: 0,
    bestOf: overrides[round.code] ?? base,
  }));
  if (opts.qualifiers) {
    rounds.unshift({ code: "Q", name: "Qualifiers", side: "qualifiers", order: 0, bestOf: null });
  }
  return ok(rounds.map((round, order) => ({ ...round, order })));
};
