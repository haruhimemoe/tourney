/**
 * @file tests/round-robin.test.ts
 * @desc roundRobin for 2..16 entrants: every pair once per leg, one bye per round for odd counts
 *       and each entrant sitting out once, sides balanced, two legs mirrored, bad input.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { roundRobin } from "../src/round-robin.js";
import { entrants, freeze, unwrap } from "./fixtures.js";

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

describe("roundRobin", () => {
  it.each(Array.from({ length: 15 }, (_, i) => i + 2))("%i entrants meet once each", (n) => {
    const ids = freeze(entrants(n));
    const rounds = unwrap(roundRobin(ids));
    const even = n % 2 === 0;
    expect(rounds).toHaveLength(even ? n - 1 : n);
    const pairs = rounds.flatMap((r) => r.matches.map((m) => pairKey(m.a, m.b)));
    expect(pairs).toHaveLength((n * (n - 1)) / 2);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const round of rounds) {
      const seen = round.matches.flatMap((m) => [m.a, m.b]);
      if (round.bye) seen.push(round.bye);
      expect(seen.sort()).toEqual([...ids].sort());
      expect(round.bye === null).toBe(even);
    }
    if (!even) expect(new Set(rounds.map((r) => r.bye)).size).toBe(n);
    // Nobody is side a more than one time over half (rounded up) of their matches.
    for (const id of ids) {
      const asA = rounds.flatMap((r) => r.matches).filter((m) => m.a === id).length;
      expect(Math.abs(asA * 2 - (n - 1))).toBeLessThanOrEqual(even ? n - 1 : 2);
    }
    expect(rounds.map((r) => r.round)).toEqual(rounds.map((_, i) => i + 1));
  });

  it("balances sides for the fixed entrant", () => {
    const rounds = unwrap(roundRobin(entrants(8)));
    const asA = rounds.flatMap((r) => r.matches).filter((m) => m.a === "e1").length;
    expect([3, 4]).toContain(asA);
  });

  it("mirrors the first leg in the second", () => {
    const one = unwrap(roundRobin(entrants(5)));
    const two = unwrap(roundRobin(entrants(5), { legs: 2 }));
    expect(two).toHaveLength(10);
    expect(two.slice(0, 5)).toEqual(one);
    for (const [i, round] of two.slice(5).entries()) {
      const first = one[i] as (typeof one)[number];
      expect(round.round).toBe(i + 6);
      expect(round.bye).toBe(first.bye);
      expect(round.matches).toEqual(first.matches.map((m) => ({ a: m.b, b: m.a })));
    }
  });

  it.each([
    [["e1"], {}],
    [Array.from({ length: 65 }, (_, i) => `e${i}`), {}],
    [["e1", "e1"], {}],
    [["e1", ""], {}],
    [["e1", "e2"], { legs: 3 }],
  ])("refuses bad input %#", (ids, options) => {
    expect(roundRobin(ids, options as { legs: 1 })).toMatchObject({
      ok: false,
      error: { code: "bad-input" },
    });
  });
});
