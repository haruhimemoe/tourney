/**
 * @file tests/ladder.test.ts
 * @desc Ladders: codes and play order for every size and format, best-of handling, refusals,
 *       and the EGC 2026 ladder.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  bracketSize,
  buildLadder,
  type LadderOptions,
  ladderShape,
  winnersCode,
} from "../src/ladder.js";

const codes = (opts: LadderOptions): string[] => {
  const result = buildLadder(opts);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.map((round) => round.code);
};

describe("bracketSize and winnersCode", () => {
  it("rounds up to a power of two", () => {
    expect([2, 3, 4, 5, 16, 17, 256].map(bracketSize)).toEqual([2, 4, 4, 8, 16, 32, 256]);
  });

  it("names rounds by entrants left", () => {
    expect([64, 32, 16, 8, 4, 2].map(winnersCode)).toEqual([
      "RO64",
      "RO32",
      "RO16",
      "QF",
      "SF",
      "F",
    ]);
  });
});

describe("buildLadder", () => {
  it("reproduces EGC 2026: 16 teams, double elimination, qualifiers", () => {
    const result = buildLadder({
      size: 16,
      format: "double",
      qualifiers: true,
      bestOf: { default: 9, rounds: { SF: 11, F: 13, LR5: 11, LR6: 13, GF: 13 } },
    });
    if (!result.ok) throw new Error(result.error.message);
    expect([...result.value.map((r) => r.code)].sort()).toEqual(
      ["Q", "RO16", "QF", "SF", "F", "GF", "LR1", "LR2", "LR3", "LR4", "LR5", "LR6"].sort(),
    );
    expect(result.value.map((r) => r.code)).toEqual([
      "Q",
      "RO16",
      "QF",
      "LR1",
      "LR2",
      "SF",
      "LR3",
      "LR4",
      "F",
      "LR5",
      "LR6",
      "GF",
    ]);
    expect(result.value[0]).toEqual({
      code: "Q",
      name: "Qualifiers",
      side: "qualifiers",
      order: 0,
      bestOf: null,
    });
    expect(result.value.find((r) => r.code === "F")).toMatchObject({
      name: "Winners Final",
      bestOf: 13,
    });
    expect(result.value.find((r) => r.code === "QF")?.bestOf).toBe(9);
    expect(result.value.map((r) => r.order)).toEqual(result.value.map((_, i) => i));
  });

  it("orders every WB round before the two losers rounds it feeds, k = 1..8", () => {
    for (let k = 1; k <= 8; k++) {
      const shape = ladderShape(2 ** k, "double", true).map((r) => r.code);
      const wb = Array.from({ length: k }, (_, i) => winnersCode(2 ** (k - i)));
      const expected = [wb[0]];
      for (let r = 1; r < k; r++) expected.push(wb[r], `LR${2 * r - 1}`, `LR${2 * r}`);
      expect(shape).toEqual([...expected, "GF", "GFR"]);
    }
  });

  it.each([2, 3, 5, 8, 33, 256])("single elimination for %i", (size) => {
    const list = codes({ size, format: "single", qualifiers: false, bestOf: 7 });
    expect(list).toHaveLength(Math.log2(bracketSize(size)));
    expect(list.at(-1)).toBe("F");
    expect(list.some((c) => c.startsWith("LR") || c.startsWith("GF"))).toBe(false);
  });

  it("names the single elimination final Final", () => {
    const result = buildLadder({ size: 4, format: "single", qualifiers: false, bestOf: 7 });
    expect(result.ok && result.value.at(-1)?.name).toBe("Final");
    expect(result.ok && result.value[0]?.name).toBe("Semifinals");
  });

  it("counts 2(k-1) losers rounds and adds GFR only in double", () => {
    expect(codes({ size: 2, format: "double", qualifiers: false, bestOf: 7 })).toEqual(["F", "GF"]);
    const big = codes({
      size: 64,
      format: "double",
      qualifiers: false,
      bestOf: 7,
      grandFinalReset: true,
    });
    expect(big.filter((c) => c.startsWith("LR"))).toHaveLength(10);
    expect(big.slice(-2)).toEqual(["GF", "GFR"]);
    expect(big[0]).toBe("RO64");
    expect(
      codes({ size: 8, format: "single", qualifiers: false, bestOf: 7, grandFinalReset: true }),
    ).not.toContain("GFR");
  });

  it.each<[string, Partial<LadderOptions>]>([
    ["size 1", { size: 1 }],
    ["size 257", { size: 257 }],
    ["fractional size", { size: 4.5 }],
    ["even best-of", { bestOf: 8 }],
    ["best-of 27", { bestOf: 27 }],
    ["best-of 0", { bestOf: { default: 0 } }],
    ["unknown round key", { bestOf: { default: 7, rounds: { RO32: 9 } } }],
    ["Q key", { bestOf: { default: 7, rounds: { Q: 9 } } }],
    ["even override", { bestOf: { default: 7, rounds: { F: 10 } } }],
  ])("refuses %s", (_, change) => {
    const result = buildLadder({
      size: 16,
      format: "double",
      qualifiers: true,
      bestOf: 7,
      ...change,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "bad-input" } });
  });
});
