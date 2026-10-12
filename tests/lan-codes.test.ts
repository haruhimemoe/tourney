/**
 * @file tests/lan-codes.test.ts
 * @desc Roommate pair codes: the low bits of six bytes, missing bytes, 500 seeded codes against
 *       the schema, the alphabet, and normalizing what people type.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { describe, expect, it } from "vitest";
import {
  normalizePairCode,
  PAIR_CODE_ALPHABET,
  PAIR_CODE_LENGTH,
  PairCodeSchema,
  pairCode,
} from "../src/lan-codes.js";
import { rng } from "./fixtures.js";

describe("pairCode", () => {
  it("reads the low five bits of the first six bytes, a missing byte as 0", () => {
    expect(pairCode(new Uint8Array(6).fill(255))).toBe("999999");
    expect(pairCode([0, 1, 2, 3, 4, 5])).toBe("ABCDEF");
    expect(pairCode([32, 33])).toBe("ABAAAA");
    expect(pairCode([0, 1, 2, 3, 4, 5, 6, 7])).toBe("ABCDEF");
  });

  it("makes codes the schema takes", () => {
    const random = rng(6);
    for (let i = 0; i < 500; i++) {
      const bytes = Array.from({ length: PAIR_CODE_LENGTH }, () => Math.floor(random() * 256));
      expect(PairCodeSchema.safeParse(pairCode(bytes)).success).toBe(true);
    }
  });

  it("draws from 32 symbols with no 0, O, 1 or I", () => {
    expect(new Set(PAIR_CODE_ALPHABET).size).toBe(32);
    expect(PAIR_CODE_ALPHABET).not.toMatch(/[0O1I]/);
  });
});

describe("normalizePairCode", () => {
  it("uppercases and drops whitespace and dashes", () => {
    expect(normalizePairCode(" abc-def ")).toBe("ABCDEF");
    expect(normalizePairCode("k7q\tx2m")).toBe("K7QX2M");
  });

  it.each(["abcde", "ABCDE0", "ABCDEFG", "", "ABC_DEF"])("refuses %j", (input) => {
    expect(normalizePairCode(input)).toBeNull();
  });
});
