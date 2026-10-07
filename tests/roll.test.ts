/**
 * @file tests/roll.test.ts
 * @desc rollFirst: the roll winner on either side, each choice, the protect default, ties and bad
 *       input.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { type RollChoice, rollFirst } from "../src/roll.js";
import { unwrap } from "./fixtures.js";

describe("rollFirst", () => {
  it("gives the roll winner what they chose and the loser the rest", () => {
    expect(unwrap(rollFirst({ a: 87, b: 12 }, { ban: "loser", pick: "winner" }))).toEqual({
      winner: "a",
      first: { ban: "b", pick: "a" },
    });
    expect(unwrap(rollFirst({ a: 3, b: 99 }, { ban: "winner", pick: "loser" }))).toEqual({
      winner: "b",
      first: { ban: "b", pick: "a" },
    });
  });

  it("sets protect only when chosen, so it defaults to the first ban downstream", () => {
    const choice: RollChoice = { ban: "winner", pick: "loser", protect: "loser" };
    expect(unwrap(rollFirst({ a: 50, b: 0 }, choice)).first).toEqual({
      ban: "a",
      pick: "b",
      protect: "b",
    });
    expect(
      unwrap(rollFirst({ a: 50, b: 0 }, { ban: "winner", pick: "winner" })).first,
    ).not.toHaveProperty("protect");
  });

  it("refuses a tie so the sides reroll", () => {
    expect(rollFirst({ a: 42, b: 42 }, { ban: "winner", pick: "loser" })).toMatchObject({
      ok: false,
      error: { code: "bad-state" },
    });
  });

  it.each([
    [
      { a: -1, b: 5 },
      { ban: "winner", pick: "loser" },
    ],
    [
      { a: 1.5, b: 5 },
      { ban: "winner", pick: "loser" },
    ],
    [
      { a: Number.NaN, b: 5 },
      { ban: "winner", pick: "loser" },
    ],
    [
      { a: 1, b: 5 },
      { ban: "first", pick: "loser" },
    ],
    [
      { a: 1, b: 5 },
      { ban: "winner", pick: "loser", protect: "x" },
    ],
  ])("refuses bad input %#", (rolls, choice) => {
    expect(rollFirst(rolls, choice as RollChoice)).toMatchObject({
      ok: false,
      error: { code: "bad-input" },
    });
  });
});
