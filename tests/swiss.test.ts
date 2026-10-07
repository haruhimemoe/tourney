/**
 * @file tests/swiss.test.ts
 * @desc swissPairings: full swiss runs for 4..32 entrants (odd counts too) with no rematch over
 *       swissRounds(n) rounds and no second bye, the fold in round one, the round limit, a field
 *       that can't pair, and bad input.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import type { GroupMatch } from "../src/standings.js";
import { swissPairings, swissRounds } from "../src/swiss.js";
import { entrants, rng, unwrap } from "./fixtures.js";

const play = (a: string, b: string, aWins: boolean): GroupMatch => ({
  a,
  b,
  status: "done",
  scoreA: aWins ? 3 : 1,
  scoreB: aWins ? 1 : 3,
  winner: aWins ? "a" : "b",
});

describe("swissPairings", () => {
  it("folds round one: 1 v n/2+1", () => {
    const first = unwrap(
      swissPairings(entrants(8), { matches: [], byes: [] }, { round: 1, rounds: 3 }),
    );
    expect(first).toEqual({
      pairs: [
        { a: "e1", b: "e5" },
        { a: "e2", b: "e6" },
        { a: "e3", b: "e7" },
        { a: "e4", b: "e8" },
      ],
      bye: null,
    });
  });

  it.each(Array.from({ length: 29 }, (_, i) => i + 4))(
    "runs %i entrants with no rematch and one bye each at most",
    (n) => {
      const ids = entrants(n);
      const rounds = swissRounds(n);
      const matches: GroupMatch[] = [];
      const byes: string[] = [];
      const random = rng(n);
      const seen = new Set<string>();
      for (let round = 1; round <= rounds; round++) {
        const next = unwrap(swissPairings(ids, { matches, byes }, { round, rounds }));
        expect(next.pairs).toHaveLength(Math.floor(n / 2));
        expect(next.bye === null).toBe(n % 2 === 0);
        const everyone = next.pairs.flatMap((p) => [p.a, p.b]).concat(next.bye ? [next.bye] : []);
        expect(new Set(everyone).size).toBe(n);
        for (const { a, b } of next.pairs) {
          const k = [a, b].sort().join("|");
          expect(seen.has(k)).toBe(false);
          seen.add(k);
          matches.push(play(a, b, random() < 0.6));
        }
        if (next.bye) {
          expect(byes).not.toContain(next.bye);
          byes.push(next.bye);
        }
      }
      expect(swissPairings(ids, { matches, byes }, { round: rounds + 1, rounds })).toMatchObject({
        error: { code: "limit" },
      });
    },
  );

  it("gives the bye to the lowest-ranked entrant without one", () => {
    const ids = entrants(5);
    const first = unwrap(swissPairings(ids, { matches: [], byes: [] }, { round: 1, rounds: 3 }));
    expect(first.bye).toBe("e5");
    const second = unwrap(
      swissPairings(ids, { matches: [], byes: ["e5"] }, { round: 2, rounds: 3 }),
    );
    expect(second.bye).toBe("e4");
  });

  it("refuses when every pairing is a rematch", () => {
    const ids = entrants(4);
    const matches = [play("e1", "e2", true), play("e1", "e3", true), play("e1", "e4", true)];
    expect(swissPairings(ids, { matches, byes: [] }, { round: 4, rounds: 4 })).toMatchObject({
      error: { code: "bad-state" },
    });
  });

  it.each([
    [["e1"], { round: 1, rounds: 1 }],
    [["e1", "e2"], { round: 0, rounds: 1 }],
    [["e1", "e2"], { round: 1, rounds: 1.5 }],
  ])("refuses bad input %#", (ids, options) => {
    expect(swissPairings(ids, { matches: [], byes: [] }, options)).toMatchObject({
      error: { code: "bad-input" },
    });
  });

  it("counts rounds", () => {
    expect([1, 2, 3, 4, 5, 8, 9, 16, 17, 64].map(swissRounds)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 6,
    ]);
  });
});
