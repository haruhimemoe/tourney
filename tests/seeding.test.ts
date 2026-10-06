/**
 * @file tests/seeding.test.ts
 * @desc Qualifier ranking (sum, average rank, missing scores, ties) and bracket seed order.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { rankQualifiers, seedPositions } from "../src/seeding.js";

const ROWS = [
  { entrantId: "a", scores: [900, 100, 500] },
  { entrantId: "b", scores: [800, 800, null] },
  { entrantId: "c", scores: [700, 900, 400] },
];

describe("rankQualifiers", () => {
  it("sums scores, null as 0", () => {
    expect(rankQualifiers(ROWS, "sum")).toEqual([
      { entrantId: "c", seed: 1, value: 2000, tied: false },
      { entrantId: "b", seed: 2, value: 1600, tied: false },
      { entrantId: "a", seed: 3, value: 1500, tied: false },
    ]);
  });

  it("averages ranks, null ranking last", () => {
    // map ranks: a 1,3,1  b 2,2,3  c 3,1,2
    const ranked = rankQualifiers(ROWS, "average-rank");
    expect(ranked.map((r) => r.entrantId)).toEqual(["a", "c", "b"]);
    expect(ranked[0]?.value).toBeCloseTo(5 / 3);
    expect(ranked[1]).toMatchObject({ tied: false, value: 2 });
  });

  it("flags ties and keeps input order", () => {
    const tied = rankQualifiers(
      [
        { entrantId: "x", scores: [5] },
        { entrantId: "y", scores: [5] },
        { entrantId: "z", scores: [1] },
      ],
      "sum",
    );
    expect(tied.map((r) => [r.entrantId, r.tied])).toEqual([
      ["x", true],
      ["y", true],
      ["z", false],
    ]);
    expect(rankQualifiers([{ entrantId: "q", scores: [] }], "average-rank")[0]?.value).toBe(0);
    expect(rankQualifiers([], "sum")).toEqual([]);
  });

  it("treats non-finite scores as missing", () => {
    const ranked = rankQualifiers(
      [
        { entrantId: "a", scores: [Number.NaN] },
        { entrantId: "b", scores: [5] },
        { entrantId: "c", scores: [Number.POSITIVE_INFINITY] },
      ],
      "sum",
    );
    expect(ranked.map((r) => [r.entrantId, r.value])).toEqual([
      ["b", 5],
      ["a", 0],
      ["c", 0],
    ]);
  });

  it("gives equal map scores the same rank", () => {
    const ranked = rankQualifiers(
      [
        { entrantId: "x", scores: [5, 1] },
        { entrantId: "y", scores: [5, 2] },
      ],
      "average-rank",
    );
    expect(ranked.map((r) => [r.entrantId, r.value])).toEqual([
      ["y", 1],
      ["x", 1.5],
    ]);
  });
});

describe("seedPositions", () => {
  it("matches the standard order", () => {
    expect(seedPositions(2)).toEqual([1, 2]);
    expect(seedPositions(4)).toEqual([1, 4, 2, 3]);
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it.each([2, 4, 8, 16, 32, 64])("uses every seed once and splits 1 and 2 for %i", (n) => {
    const order = seedPositions(n);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(order.indexOf(1) < n / 2).toBe(true);
    expect(order.indexOf(2) >= n / 2).toBe(true);
    for (let j = 0; j < n / 2; j++)
      expect((order[2 * j] as number) + (order[2 * j + 1] as number)).toBe(n + 1);
  });
});
