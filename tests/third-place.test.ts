/**
 * @file tests/third-place.test.ts
 * @desc Third place: 3RD right before F fed by the SF losers for 3..64 entrants, play order of
 *       match codes, none for 2 entrants or double elimination, best-of key, size 3 as a bye,
 *       full runs, and clearing an SF while 3RD has a result.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { createBracket } from "../src/bracket.js";
import { champion, clearResult, reportResult } from "../src/bracket-report.js";
import { buildLadder } from "../src/ladder.js";
import { placements } from "../src/placements.js";
import { entrants, playOut, rng, unwrap } from "./fixtures.js";

const single = (n: number) =>
  unwrap(createBracket({ entrants: entrants(n), format: "single", bestOf: 5, thirdPlace: true }));

describe("third place", () => {
  it.each(Array.from({ length: 62 }, (_, i) => i + 3))(
    "%i entrants get 3RD fed by SF losers",
    (n) => {
      const bracket = single(n);
      const codes = bracket.rounds.map((r) => r.code);
      expect(codes.slice(-3)).toEqual(["SF", "3RD", "F"]);
      expect(bracket.rounds.at(-2)).toMatchObject({ name: "Third Place", side: "third" });
      const semis = bracket.matches.filter((m) => m.round === "SF").map((m) => m.code);
      const third = bracket.matches.find((m) => m.round === "3RD");
      expect([third?.a.source, third?.b.source]).toEqual(
        semis.map((match) => ({ kind: "loser", match })),
      );
      // Codes stay in play order: 3RD is the second-to-last match, F the last.
      expect(bracket.matches.at(-2)?.round).toBe("3RD");
      expect(bracket.matches.at(-1)?.round).toBe("F");
      expect(bracket.matches.map((m) => m.code)).toEqual(
        bracket.matches.map((_, i) => `M${i + 1}`),
      );

      const random = rng(n);
      const { bracket: done } = playOut(bracket, () => (random() < 0.5 ? "a" : "b"));
      expect(champion(done)).not.toBeNull();
      const played = done.matches.find((m) => m.round === "3RD");
      expect(["done", "bye"]).toContain(played?.status);
    },
  );

  it("makes 3RD a bye for 3 entrants: the SF loser is third", () => {
    const after = unwrap(reportResult(single(3), "M2", { scoreA: 3, scoreB: 0 }));
    const third = after.matches.find((m) => m.round === "3RD");
    expect(third).toMatchObject({ status: "bye", winner: "b" });
    expect(third?.b.entrant).toBe("e3");
    const done = unwrap(reportResult(after, "M4", { scoreA: 3, scoreB: 1 }));
    expect(placements(done).map((p) => p.place)).toEqual([1, 2, 3]);
  });

  it("adds nothing for 2 entrants or double elimination", () => {
    expect(single(2).rounds.map((r) => r.code)).toEqual(["F"]);
    const double = unwrap(
      createBracket({ entrants: entrants(8), format: "double", bestOf: 5, thirdPlace: true }),
    );
    expect(double.rounds.map((r) => r.code)).not.toContain("3RD");
  });

  it("takes a best-of for 3RD only when it is in the ladder", () => {
    const ladder = unwrap(
      buildLadder({
        size: 8,
        format: "single",
        qualifiers: true,
        bestOf: { default: 7, rounds: { "3RD": 5 } },
        thirdPlace: true,
      }),
    );
    expect(ladder.map((r) => [r.code, r.order, r.bestOf])).toEqual([
      ["Q", 0, null],
      ["QF", 1, 7],
      ["SF", 2, 7],
      ["3RD", 3, 5],
      ["F", 4, 7],
    ]);
    expect(
      buildLadder({
        size: 8,
        format: "single",
        qualifiers: false,
        bestOf: { default: 7, rounds: { "3RD": 5 } },
      }),
    ).toMatchObject({ error: { code: "bad-input" } });
  });

  it("refuses clearing an SF while 3RD has a result", () => {
    let bracket = single(4);
    bracket = unwrap(reportResult(bracket, "M1", { scoreA: 3, scoreB: 1 }));
    bracket = unwrap(reportResult(bracket, "M2", { scoreA: 3, scoreB: 1 }));
    bracket = unwrap(reportResult(bracket, "M3", { scoreA: 3, scoreB: 2 }));
    expect(clearResult(bracket, "M1")).toMatchObject({ error: { code: "out-of-order" } });
    expect(unwrap(clearResult(bracket, "M3")).matches[2]?.status).toBe("ready");
  });
});
