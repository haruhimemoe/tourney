/**
 * @file tests/groups.test.ts
 * @desc snakeGroups (16 into 4, uneven counts) and seedsFromGroups (2, 4 and 8 groups, an odd
 *       group count repaired, advance 1..4, into createBracket with no same-group first round),
 *       plus the group schema and bad input.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { createBracket } from "../src/bracket.js";
import { GroupSchema, seedsFromGroups, snakeGroups } from "../src/groups.js";
import { entrants, unwrap } from "./fixtures.js";

/** Groups named A, B, ... with entrants A1, A2, ... in place order. */
const named = (count: number, size: number) =>
  Array.from({ length: count }, (_, g) =>
    Array.from({ length: size }, (_, p) => `${String.fromCharCode(65 + g)}${p + 1}`),
  );
const firstRound = (seeds: string[]) => {
  const bracket = unwrap(createBracket({ entrants: seeds, format: "single", bestOf: 3 }));
  const round = bracket.rounds[0]?.code;
  return bracket.matches
    .filter((m) => m.round === round)
    .map((m) => [m.a.entrant, m.b.entrant])
    .filter((pair): pair is [string, string] => pair[0] !== null && pair[1] !== null);
};

describe("snakeGroups", () => {
  it("snakes 16 seeds into 4 groups", () => {
    expect(unwrap(snakeGroups(entrants(16), 4))).toEqual([
      ["e1", "e8", "e9", "e16"],
      ["e2", "e7", "e10", "e15"],
      ["e3", "e6", "e11", "e14"],
      ["e4", "e5", "e12", "e13"],
    ]);
  });

  it("handles a count that does not divide", () => {
    expect(unwrap(snakeGroups(entrants(7), 3))).toEqual([
      ["e1", "e6", "e7"],
      ["e2", "e5"],
      ["e3", "e4"],
    ]);
  });

  it.each([[0], [9], [1.5]])("refuses %s groups", (count) => {
    expect(snakeGroups(entrants(8), count)).toMatchObject({ error: { code: "bad-input" } });
  });
});

describe("seedsFromGroups", () => {
  it("pairs A1 v B2 and B1 v A2 for two groups", () => {
    const seeds = unwrap(seedsFromGroups(named(2, 4), 2));
    expect(seeds).toEqual(["A1", "B1", "A2", "B2"]);
    expect(firstRound(seeds)).toEqual([
      ["A1", "B2"],
      ["B1", "A2"],
    ]);
  });

  it("pairs group winners with other groups' runners-up for four groups", () => {
    const seeds = unwrap(seedsFromGroups(named(4, 4), 2));
    expect(
      firstRound(seeds)
        .map((p) => p.join(" v "))
        .sort(),
    ).toEqual(["A1 v D2", "B1 v C2", "C1 v B2", "D1 v A2"]);
  });

  it.each([
    [2, 1],
    [2, 2],
    [2, 3],
    [2, 4],
    [3, 2],
    [3, 3],
    [4, 2],
    [4, 3],
    [4, 4],
    [5, 2],
    [6, 2],
    [8, 2],
    [8, 4],
  ])("%i groups advancing %i never meet their own group first", (count, advance) => {
    const seeds = unwrap(seedsFromGroups(named(count, 4), advance));
    expect(seeds).toHaveLength(count * advance);
    expect(new Set(seeds).size).toBe(seeds.length);
    for (const [a, b] of firstRound(seeds)) expect(a[0]).not.toBe(b[0]);
    // Placements stay in tiers: every 1st before every 2nd.
    expect(seeds.slice(0, count).every((id) => id.endsWith("1"))).toBe(true);
  });

  it.each([
    [[], 1],
    [named(2, 2), 3],
    [named(2, 2), 0],
    [named(1, 2), 1],
    [
      [
        ["x", "y"],
        ["x", "z"],
      ],
      2,
    ],
  ])("refuses bad input %#", (groups, advance) => {
    expect(seedsFromGroups(groups, advance)).toMatchObject({ error: { code: "bad-input" } });
  });

  it("parses a stored group", () => {
    expect(GroupSchema.parse({ id: "g1", name: "Group A", entrants: ["A1", "A2"] }).name).toBe(
      "Group A",
    );
  });
});
