/**
 * @file src/bracket-report.ts
 * @desc Bracket results: report a score or a forfeit, clear a result, the champion, and an
 *       entrant's matches. Every call returns a new bracket and settles it.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { type Bracket, type BracketMatch, hasResult, settleBracket, winnerOf } from "./bracket.js";
import type { Side } from "./ids.js";
import { checkScore } from "./match.js";
import { fail, ok, type Result } from "./result.js";

const replace = (bracket: Bracket, match: BracketMatch): Bracket =>
  settleBracket({
    ...bracket,
    matches: bracket.matches.map((m) => (m.code === match.code ? match : m)),
  });

const readyMatch = (bracket: Bracket, code: string): Result<BracketMatch> => {
  const match = bracket.matches.find((m) => m.code === code);
  if (!match) return fail("not-found", `no match ${code}`);
  if (match.status !== "ready") return fail("bad-state", `${code} is ${match.status}`);
  return ok(match);
};

/**
 * @function reportResult
 * @param bracket {Bracket} the bracket
 * @param code {string} the match, e.g. "M5"
 * @param score {{ scoreA: number; scoreB: number }} maps won by each side
 * @returns {Result<Bracket>} the bracket with the result and every later side filled in, or
 *          not-found, bad-state (match not ready) or bad-score
 */
export const reportResult = (
  bracket: Bracket,
  code: string,
  score: { scoreA: number; scoreB: number },
): Result<Bracket> => {
  const match = readyMatch(bracket, code);
  if (!match.ok) return match;
  const winner = checkScore(match.value.bestOf, score.scoreA, score.scoreB);
  if (!winner.ok) return winner;
  const { scoreA, scoreB } = score;
  return ok(
    replace(bracket, { ...match.value, scoreA, scoreB, status: "done", winner: winner.value }),
  );
};

/**
 * @function reportForfeit
 * @param bracket {Bracket} the bracket
 * @param code {string} the match
 * @param winner {Side} the side that goes through
 * @returns {Result<Bracket>} the bracket with the forfeit, or not-found or bad-state
 */
export const reportForfeit = (bracket: Bracket, code: string, winner: Side): Result<Bracket> => {
  const match = readyMatch(bracket, code);
  if (!match.ok) return match;
  if (winner !== "a" && winner !== "b") return fail("bad-input", "winner is a or b");
  const next = { ...match.value, status: "forfeit" as const, scoreA: null, scoreB: null, winner };
  return ok(replace(bracket, next));
};

/**
 * @function clearResult
 * @param bracket {Bracket} the bracket
 * @param code {string} a played or forfeited match
 * @returns {Result<Bracket>} the bracket with the match ready again and later sides emptied, or
 *          not-found, bad-state (no result to clear, e.g. a bye) or out-of-order (a later match
 *          fed by this one, directly or through byes, has a result; clear that first)
 */
export const clearResult = (bracket: Bracket, code: string): Result<Bracket> => {
  const match = bracket.matches.find((m) => m.code === code);
  if (!match) return fail("not-found", `no match ${code}`);
  if (!hasResult(match)) return fail("bad-state", `${code} has no result`);
  // Walk everything fed by this match, through byes and unplayed matches.
  const reach = new Set([code]);
  for (const m of bracket.matches) {
    const fed = [m.a, m.b].some((s) => s.source.kind !== "seed" && reach.has(s.source.match));
    if (!fed) continue;
    if (hasResult(m)) return fail("out-of-order", `clear ${m.code} first`);
    reach.add(m.code);
  }
  const next = { ...match, status: "pending" as const, scoreA: null, scoreB: null, winner: null };
  return ok(replace(bracket, next));
};

/**
 * @function champion
 * @param bracket {Bracket} the bracket
 * @returns {string | null} the winner of the last final played (the reset if played, else the
 *          grand final, or the final in single elimination), else null
 */
export const champion = (bracket: Bracket): string | null => {
  const last = (round: string) => bracket.matches.find((m) => m.round === round);
  if (bracket.format === "single") {
    const final = last("F");
    return final && hasResult(final) ? winnerOf(final, "winner") : null;
  }
  const reset = last("GFR");
  if (reset && hasResult(reset)) return winnerOf(reset, "winner");
  const gf = last("GF");
  if (!gf || !hasResult(gf)) return null;
  return gf.winner === "a" || !reset ? winnerOf(gf, "winner") : null;
};

/**
 * @function matchesFor
 * @param bracket {Bracket} the bracket
 * @param entrant {string} an entrant id
 * @returns {BracketMatch[]} matches the entrant is placed in, in play order (byes included)
 */
export const matchesFor = (bracket: Bracket, entrant: string): BracketMatch[] =>
  bracket.matches.filter((m) => m.a.entrant === entrant || m.b.entrant === entrant);

/**
 * @function nextMatch
 * @param bracket {Bracket} the bracket
 * @param entrant {string} an entrant id
 * @returns {BracketMatch | null} the entrant's ready match, or null when they wait or are out
 */
export const nextMatch = (bracket: Bracket, entrant: string): BracketMatch | null =>
  matchesFor(bracket, entrant).find((m) => m.status === "ready") ?? null;
