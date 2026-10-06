/**
 * @file tests/fixtures.ts
 * @desc Shared test helpers: unwrap a Result, deep-freeze inputs, run a bracket to the end.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Bracket, BracketMatch } from "../src/bracket.js";
import { reportResult } from "../src/bracket-report.js";
import type { Side } from "../src/ids.js";
import { winsNeeded } from "../src/match.js";
import type { Result } from "../src/result.js";

export const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
};

export const freeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    for (const inner of Object.values(value)) freeze(inner);
    Object.freeze(value);
  }
  return value;
};

/** Entrant ids e1..en, seed order. */
export const entrants = (n: number): string[] => Array.from({ length: n }, (_, i) => `e${i + 1}`);

/** A tiny seeded generator, so "random" runs repeat. */
export const rng = (seed: number) => () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};

/** Play every ready match until none are left, picking winners with `pick`. */
export const playOut = (
  bracket: Bracket,
  pick: (match: BracketMatch) => Side,
): { bracket: Bracket; played: BracketMatch[] } => {
  const played: BracketMatch[] = [];
  for (
    let ready = bracket.matches.find((m) => m.status === "ready");
    ready;
    ready = bracket.matches.find((m) => m.status === "ready")
  ) {
    const winner = pick(ready);
    const need = winsNeeded(ready.bestOf);
    const score = winner === "a" ? { scoreA: need, scoreB: need - 1 } : { scoreA: 0, scoreB: need };
    bracket = unwrap(reportResult(bracket, ready.code, score));
    played.push(bracket.matches.find((m) => m.code === ready.code) as BracketMatch);
  }
  return { bracket, played };
};

/** Losses per entrant in played (done or forfeit) matches. */
export const losses = (played: readonly BracketMatch[]): Map<string, number> => {
  const count = new Map<string, number>();
  for (const m of played) {
    const loser = m.winner === "a" ? m.b.entrant : m.a.entrant;
    if (loser) count.set(loser, (count.get(loser) ?? 0) + 1);
  }
  return count;
};
