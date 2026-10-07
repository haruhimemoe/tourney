/**
 * @file tests/placements.test.ts
 * @desc placements: single with and without 3RD, double with GFR skipped and played, byes,
 *       partial places mid-bracket, and every size 2..32 in both formats run to the end.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { type Bracket, createBracket } from "../src/bracket.js";
import { champion, reportResult } from "../src/bracket-report.js";
import type { Format } from "../src/ladder.js";
import { placements } from "../src/placements.js";
import { entrants, freeze, playOut, rng, unwrap } from "./fixtures.js";

const make = (
  n: number,
  format: Format,
  extra: { thirdPlace?: boolean; grandFinalReset?: boolean } = {},
) => unwrap(createBracket({ entrants: entrants(n), format, bestOf: 3, ...extra }));
const places = (bracket: Bracket) => placements(bracket).map((p) => p.place);
const higherSeed = (bracket: Bracket) => playOut(bracket, () => "a").bracket;

describe("placements", () => {
  it("shares 3rd between SF losers without a third place match", () => {
    expect(places(higherSeed(make(8, "single")))).toEqual([1, 2, 3, 3, 5, 5, 5, 5]);
  });

  it("splits 3rd and 4th with a third place match, below the finalist", () => {
    const done = playOut(make(8, "single", { thirdPlace: true }), (m) =>
      m.round === "3RD" ? "b" : "a",
    ).bracket;
    const rows = placements(done);
    expect(rows.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 5, 5, 5]);
    expect(rows.slice(0, 4).map((p) => p.entrantId)).toEqual(["e1", "e2", "e3", "e4"]);
  });

  it("places the double elimination losers bracket, GFR skipped", () => {
    const done = higherSeed(make(8, "double", { grandFinalReset: true }));
    expect(done.matches.at(-1)?.status).toBe("skipped");
    expect(places(done)).toEqual([1, 2, 3, 4, 5, 5, 7, 7]);
    expect(placements(done)[0]?.entrantId).toBe(champion(done));
  });

  it("places after a played reset", () => {
    const done = playOut(make(4, "double", { grandFinalReset: true }), (m) =>
      m.round === "GF" ? "b" : "a",
    ).bracket;
    expect(done.matches.at(-1)?.status).toBe("done");
    expect(places(done)).toEqual([1, 2, 3, 4]);
    expect(placements(done)[0]?.entrantId).toBe(champion(done));
  });

  it("fills places in as rounds finish", () => {
    let bracket = make(8, "single");
    expect(places(bracket).every((p) => p === null)).toBe(true);
    bracket = unwrap(reportResult(bracket, "M1", { scoreA: 2, scoreB: 0 }));
    expect(places(bracket).every((p) => p === null)).toBe(true);
    for (const code of ["M2", "M3", "M4"])
      bracket = unwrap(reportResult(bracket, code, { scoreA: 2, scoreB: 1 }));
    const rows = placements(freeze(bracket));
    expect(rows.map((p) => p.place)).toEqual([5, 5, 5, 5, null, null, null, null]);
    expect(rows.slice(0, 4).map((p) => p.entrantId)).toEqual(["e5", "e6", "e7", "e8"]);
  });

  it.each([5, 6, 12])("places %i entrants with byes", (n) => {
    expect(places(higherSeed(make(n, "single"))).slice(0, 4)).toEqual([1, 2, 3, 3]);
  });

  it.each(
    Array.from({ length: 31 }, (_, i) => i + 2).flatMap((n) => [
      [n, "single" as const],
      [n, "double" as const],
    ]),
  )("%i %s run to the end gives consistent places", (n, format) => {
    const random = rng(n * 7);
    const bracket = make(n, format, { thirdPlace: n % 2 === 0, grandFinalReset: n % 3 === 0 });
    const done = playOut(bracket, () => (random() < 0.5 ? "a" : "b")).bracket;
    const rows = placements(done);
    expect(rows).toHaveLength(n);
    expect(rows[0]).toEqual({ entrantId: champion(done), place: 1 });
    if (n > 1) expect(rows[1]?.place).toBe(2);
    for (const row of rows) {
      expect(row.place).not.toBeNull();
      // A place is one more than the number of entrants strictly above it.
      const above = rows.filter((r) => (r.place as number) < (row.place as number)).length;
      expect(row.place).toBe(above + 1);
    }
  });
});
