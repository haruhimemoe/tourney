/**
 * @file src/bracket.ts
 * @desc Brackets: the schema, createBracket (ladder + wiring + byes) and settleBracket, which
 *       fills each side from its source and works out every match's status. Pure; one pass in
 *       play order, since sources only point back.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { type Source, SourceSchema, wireBracket } from "./bracket-wire.js";
import { IdSchema, SideSchema } from "./ids.js";
import {
  type BestOfInput,
  buildLadder,
  type Format,
  FormatSchema,
  MAX_ENTRANTS,
  RoundSchema,
} from "./ladder.js";
import { fail, ok, type Result } from "./result.js";

/** Bracket match statuses. `bye`: a side is empty. `skipped`: an unplayed bracket reset. */
export const BRACKET_STATUSES = ["pending", "ready", "done", "forfeit", "bye", "skipped"] as const;

/** One side: its source, the entrant once known (null when empty) and whether it is known. */
export const BracketSideSchema = z.object({
  source: SourceSchema,
  entrant: IdSchema.nullable(),
  settled: z.boolean(),
});

/** One side. */
export type BracketSide = z.infer<typeof BracketSideSchema>;

/** One bracket match. */
export const BracketMatchSchema = z.object({
  code: z.string().min(1).max(16),
  round: z.string().min(1).max(8),
  a: BracketSideSchema,
  b: BracketSideSchema,
  bestOf: z.number().int().min(1),
  status: z.enum(BRACKET_STATUSES),
  scoreA: z.number().int().min(0).nullable(),
  scoreB: z.number().int().min(0).nullable(),
  winner: SideSchema.nullable(),
});

/** One bracket match. */
export type BracketMatch = z.infer<typeof BracketMatchSchema>;

/** A bracket: entrants in seed order, its rounds and matches in play order. */
export const BracketSchema = z.object({
  format: FormatSchema,
  entrants: z.array(IdSchema).min(2).max(MAX_ENTRANTS),
  grandFinalReset: z.boolean(),
  rounds: z.array(RoundSchema),
  matches: z.array(BracketMatchSchema),
});

/** A bracket. */
export type Bracket = z.infer<typeof BracketSchema>;

/** Statuses that carry a result a later match depends on. */
const RESULT = new Set(["done", "forfeit"]);
const DECIDED = new Set(["done", "forfeit", "bye"]);

/**
 * @function isDecided
 * @param match {BracketMatch} a match
 * @returns {boolean} true once its winner and loser are known (played, forfeited or a bye)
 */
export const isDecided = (match: BracketMatch): boolean => DECIDED.has(match.status);

/**
 * @function hasResult
 * @param match {BracketMatch} a match
 * @returns {boolean} true when it was played or forfeited
 */
export const hasResult = (match: BracketMatch): boolean => RESULT.has(match.status);

/**
 * @function winnerOf
 * @param match {BracketMatch} a match
 * @param want {"winner" | "loser"} which one
 * @returns {string | null} that entrant, or null when it has none (a bye's loser)
 */
export const winnerOf = (match: BracketMatch, want: "winner" | "loser"): string | null => {
  if (!match.winner) return null;
  const side = want === "winner" ? match.winner : match.winner === "a" ? "b" : "a";
  return match[side].entrant;
};

/**
 * @function settleBracket
 * @param bracket {Bracket} a bracket whose results are set
 * @returns {Bracket} a copy with every side filled from its source and every status worked out:
 *          pending, ready, bye or skipped (results stay as they are)
 */
export const settleBracket = (bracket: Bracket): Bracket => {
  const seen = new Map<string, BracketMatch>();
  const resolve = (source: Source): { entrant: string | null; settled: boolean } => {
    if (source.kind === "seed") {
      return { entrant: bracket.entrants[source.seed - 1] ?? null, settled: true };
    }
    const from = seen.get(source.match);
    if (!from || !isDecided(from)) return { entrant: null, settled: false };
    return { entrant: winnerOf(from, source.kind), settled: true };
  };
  const matches = bracket.matches.map((match) => {
    const a = { ...match.a, ...resolve(match.a.source) };
    const b = { ...match.b, ...resolve(match.b.source) };
    let next: BracketMatch = { ...match, a, b };
    if (!hasResult(match)) {
      next = { ...next, status: "pending", scoreA: null, scoreB: null, winner: null };
      const gf = match.round === "GFR" && match.a.source.kind === "winner";
      const feeder = gf ? seen.get((match.a.source as { match: string }).match) : undefined;
      if (feeder && hasResult(feeder) && feeder.winner === "a") {
        next = { ...next, status: "skipped" };
      } else if (a.settled && b.settled) {
        if (a.entrant !== null && b.entrant !== null) next = { ...next, status: "ready" };
        else {
          const winner = a.entrant !== null ? "a" : b.entrant !== null ? "b" : null;
          next = { ...next, status: "bye", winner };
        }
      }
    }
    seen.set(match.code, next);
    return next;
  });
  return { ...bracket, matches };
};

/** What createBracket takes. */
export type BracketOptions = {
  /** Entrant ids in seed order: index 0 is seed 1. */
  entrants: readonly string[];
  format: Format;
  bestOf: BestOfInput;
  /** Double elimination only. */
  grandFinalReset?: boolean;
};

/**
 * @function createBracket
 * @param opts {BracketOptions} seeded entrants, format, best-of and reset
 * @returns {Result<Bracket>} a settled bracket with byes played out, or bad-input for empty or
 *          repeated ids or anything buildLadder refuses
 */
export const createBracket = (opts: BracketOptions): Result<Bracket> => {
  const entrants = [...opts.entrants];
  if (entrants.some((id) => !IdSchema.safeParse(id).success)) {
    return fail("bad-input", "every entrant needs an id");
  }
  if (new Set(entrants).size !== entrants.length) {
    return fail("bad-input", "an entrant is listed twice");
  }
  const grandFinalReset = opts.format === "double" && opts.grandFinalReset === true;
  const ladder = buildLadder({
    size: entrants.length,
    format: opts.format,
    qualifiers: false,
    bestOf: opts.bestOf,
    grandFinalReset,
  });
  if (!ladder.ok) return ladder;
  const side = (source: Source): BracketSide => ({ source, entrant: null, settled: false });
  const matches = wireBracket(entrants.length, ladder.value).map(
    (wired): BracketMatch => ({
      ...wired,
      a: side(wired.a),
      b: side(wired.b),
      status: "pending",
      scoreA: null,
      scoreB: null,
      winner: null,
    }),
  );
  const bracket = { format: opts.format, entrants, grandFinalReset, rounds: ladder.value, matches };
  return ok(settleBracket(bracket));
};
