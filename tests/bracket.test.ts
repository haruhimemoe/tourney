/**
 * @file tests/bracket.test.ts
 * @desc Bracket creation and wiring: match counts, the 8-entrant double elimination wiring,
 *       byes, drop order, and refusals.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { type BracketMatch, BracketSchema, createBracket } from "../src/bracket.js";
import { dropOrder } from "../src/bracket-wire.js";
import { bracketSize } from "../src/ladder.js";
import { entrants, freeze, unwrap } from "./fixtures.js";

const src = (m: BracketMatch) => [m.code, m.round, m.a.source, m.b.source];
const W = (match: string) => ({ kind: "winner", match });
const L = (match: string) => ({ kind: "loser", match });
const S = (seed: number) => ({ kind: "seed", seed });

describe("createBracket", () => {
  it("wires 8-entrant double elimination exactly", () => {
    const b = unwrap(
      createBracket({ entrants: entrants(8), format: "double", bestOf: 7, grandFinalReset: true }),
    );
    expect(b.matches.map(src)).toEqual([
      ["M1", "QF", S(1), S(8)],
      ["M2", "QF", S(4), S(5)],
      ["M3", "QF", S(2), S(7)],
      ["M4", "QF", S(3), S(6)],
      ["M5", "SF", W("M1"), W("M2")],
      ["M6", "SF", W("M3"), W("M4")],
      ["M7", "LR1", L("M1"), L("M2")],
      ["M8", "LR1", L("M3"), L("M4")],
      ["M9", "LR2", W("M7"), L("M6")],
      ["M10", "LR2", W("M8"), L("M5")],
      ["M11", "F", W("M5"), W("M6")],
      ["M12", "LR3", W("M9"), W("M10")],
      ["M13", "LR4", W("M12"), L("M11")],
      ["M14", "GF", W("M11"), W("M13")],
      ["M15", "GFR", W("M14"), L("M14")],
    ]);
    expect(b.matches.slice(0, 4).every((m) => m.status === "ready")).toBe(true);
    expect(b.matches.slice(4).every((m) => m.status === "pending")).toBe(true);
    expect(BracketSchema.parse(b)).toEqual(b);
  });

  it.each([2, 3, 4, 5, 6, 8, 12, 16, 20, 32, 64])(
    "has n-1 single and 2n-2 (+1) double matches for %i",
    (size) => {
      const n = bracketSize(size);
      const single = unwrap(
        createBracket({ entrants: entrants(size), format: "single", bestOf: 7 }),
      );
      expect(single.matches).toHaveLength(n - 1);
      const double = unwrap(
        createBracket({ entrants: entrants(size), format: "double", bestOf: 7 }),
      );
      expect(double.matches).toHaveLength(2 * n - 2);
      const reset = unwrap(
        createBracket({
          entrants: entrants(size),
          format: "double",
          bestOf: 7,
          grandFinalReset: true,
        }),
      );
      expect(reset.matches).toHaveLength(2 * n - 1);
      for (const m of reset.matches) {
        for (const s of [m.a.source, m.b.source]) {
          if (s.kind !== "seed")
            expect(Number(s.match.slice(1))).toBeLessThan(Number(m.code.slice(1)));
        }
      }
    },
  );

  it("plays byes out: top seeds advance, empty sides cascade in the losers bracket", () => {
    const b = unwrap(createBracket({ entrants: entrants(3), format: "double", bestOf: 7 }));
    const [m1, m2, m3, m4] = b.matches;
    expect(m1).toMatchObject({
      status: "bye",
      winner: "a",
      a: { entrant: "e1" },
      b: { entrant: null, settled: true },
    });
    expect(m2).toMatchObject({ status: "ready", a: { entrant: "e2" }, b: { entrant: "e3" } });
    expect(m3).toMatchObject({
      round: "F",
      status: "pending",
      a: { entrant: "e1", settled: true },
      b: { settled: false },
    });
    expect(m4).toMatchObject({
      round: "LR1",
      status: "pending",
      a: { entrant: null, settled: true },
    });
  });

  it("gives a double bye no winner", () => {
    // 5 in an 8-bracket: seeds 6, 7, 8 are empty, so M1, M3 and M4 are byes.
    const b = unwrap(createBracket({ entrants: entrants(5), format: "double", bestOf: 7 }));
    const at = (code: string) => b.matches.find((m) => m.code === code);
    expect(["M1", "M2", "M3", "M4"].map((c) => at(c)?.status)).toEqual([
      "bye",
      "ready",
      "bye",
      "bye",
    ]);
    expect(at("M7")).toMatchObject({
      round: "LR1",
      status: "pending",
      a: { entrant: null, settled: true },
    });
    expect(at("M8")).toMatchObject({ round: "LR1", status: "bye", winner: null });
    expect(at("M10")).toMatchObject({
      round: "LR2",
      status: "pending",
      a: { entrant: null, settled: true },
    });
  });

  it("refuses bad entrants and passes ladder errors through", () => {
    expect(createBracket({ entrants: ["a", "a"], format: "single", bestOf: 7 }).ok).toBe(false);
    expect(createBracket({ entrants: ["a", ""], format: "single", bestOf: 7 }).ok).toBe(false);
    expect(createBracket({ entrants: ["a"], format: "single", bestOf: 7 }).ok).toBe(false);
    expect(createBracket({ entrants: ["a", "b"], format: "single", bestOf: 4 }).ok).toBe(false);
  });

  it("ignores grandFinalReset in single elimination and never mutates input", () => {
    const list = freeze(entrants(4));
    const b = unwrap(
      createBracket({ entrants: list, format: "single", bestOf: 7, grandFinalReset: true }),
    );
    expect(b.grandFinalReset).toBe(false);
    expect(b.matches.map((m) => m.round)).toEqual(["SF", "SF", "F"]);
  });
});

describe("dropOrder", () => {
  it("cycles reversed, in order, halves swapped", () => {
    expect(dropOrder(4, 1)).toEqual([3, 2, 1, 0]);
    expect(dropOrder(4, 2)).toEqual([0, 1, 2, 3]);
    expect(dropOrder(4, 3)).toEqual([2, 3, 0, 1]);
    expect(dropOrder(4, 4)).toEqual([3, 2, 1, 0]);
    expect(dropOrder(1, 3)).toEqual([0]);
  });
});
