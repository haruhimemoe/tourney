/**
 * @file tests/dropouts.test.ts
 * @desc Dropout forfeits: a withdrawn entrant's ready matches go to the other side in play order,
 *       a later match once its other side is known, both sides withdrawn, the losers bracket drop
 *       and the grand final reset, no-ops, no mutation, and a double elimination run with an
 *       entrant withdrawn from the start.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { describe, expect, it } from "vitest";
import { type Bracket, BracketSchema, createBracket, winnerOf } from "../src/bracket.js";
import { champion, matchesFor, reportResult } from "../src/bracket-report.js";
import { forfeitWithdrawn } from "../src/dropouts.js";
import { entrants, freeze, playOut, unwrap } from "./fixtures.js";

// M1 e1 vs e4, M2 e2 vs e3, M3 the final.
const single = (): Bracket =>
  unwrap(createBracket({ entrants: entrants(4), format: "single", bestOf: 7 }));
const double = (size: number): Bracket =>
  unwrap(
    createBracket({ entrants: entrants(size), format: "double", bestOf: 7, grandFinalReset: true }),
  );
const find = (bracket: Bracket, code: string) => bracket.matches.find((m) => m.code === code);
const report = (bracket: Bracket, codes: string[]): Bracket =>
  codes.reduce((b, code) => unwrap(reportResult(b, code, { scoreA: 4, scoreB: 2 })), bracket);

describe("forfeitWithdrawn", () => {
  it("forfeits a withdrawn entrant's ready match to the other side, once", () => {
    const out = unwrap(forfeitWithdrawn(single(), ["e4"]));
    expect(out.forfeited).toEqual(["M1"]);
    expect(find(out.bracket, "M1")).toMatchObject({
      status: "forfeit",
      winner: "a",
      scoreA: null,
      scoreB: null,
    });
    expect(find(out.bracket, "M3")?.status).toBe("pending");
    expect(unwrap(forfeitWithdrawn(out.bracket, ["e4"]))).toEqual({
      bracket: out.bracket,
      forfeited: [],
    });
  });

  it("forfeits the next match only once its other side is known", () => {
    const won = report(single(), ["M1"]);
    expect(unwrap(forfeitWithdrawn(won, ["e1"])).forfeited).toEqual([]);
    const out = unwrap(forfeitWithdrawn(report(won, ["M2"]), ["e1"]));
    expect(out.forfeited).toEqual(["M3"]);
    expect(find(out.bracket, "M3")).toMatchObject({ status: "forfeit", winner: "b" });
    expect(champion(out.bracket)).toBe("e2");
  });

  it("sends side a through when both sides withdrew, then forfeits its next match", () => {
    const first = unwrap(forfeitWithdrawn(single(), ["e1", "e4"]));
    expect(first.forfeited).toEqual(["M1"]);
    expect(find(first.bracket, "M1")).toMatchObject({ status: "forfeit", winner: "a" });
    const out = unwrap(forfeitWithdrawn(report(first.bracket, ["M2"]), ["e1", "e4"]));
    expect(out.forfeited).toEqual(["M3"]);
    expect(find(out.bracket, "M3")).toMatchObject({ status: "forfeit", winner: "b" });
  });

  it("leaves the bracket as it was for nobody, an unknown id or a finished bracket", () => {
    const start = single();
    expect(unwrap(forfeitWithdrawn(start, []))).toEqual({ bracket: start, forfeited: [] });
    expect(unwrap(forfeitWithdrawn(start, ["e9"]))).toEqual({ bracket: start, forfeited: [] });
    const { bracket: done } = playOut(start, () => "a");
    expect(unwrap(forfeitWithdrawn(done, ["e2"]))).toEqual({ bracket: done, forfeited: [] });
  });

  it("never touches its input", () => {
    const start = freeze(single());
    const before = structuredClone(start);
    const out = unwrap(forfeitWithdrawn(start, ["e4"]));
    expect(start).toEqual(before);
    expect(out.bracket).not.toEqual(start);
  });

  it("forfeits the winners match, then the losers match the entrant dropped into", () => {
    const out = unwrap(forfeitWithdrawn(report(double(4), ["M2"]), ["e4"]));
    const played = matchesFor(out.bracket, "e4");
    expect(played.map((m) => m.round)).toEqual(["SF", "LR1"]);
    expect(out.forfeited).toEqual(played.map((m) => m.code));
    expect(played.map((m) => [m.status, winnerOf(m, "winner")])).toEqual([
      ["forfeit", "e1"],
      ["forfeit", "e3"],
    ]);
  });

  it("forfeits the grand final and the reset it opens when the winners side withdraws", () => {
    // Side a wins everything before the grand final: e1 from winners, e4 from losers.
    const toFinal = report(double(4), ["M1", "M2", "M3", "M4", "M5"]);
    expect(find(toFinal, "M6")).toMatchObject({ a: { entrant: "e1" }, b: { entrant: "e4" } });
    const out = unwrap(forfeitWithdrawn(toFinal, ["e1"]));
    expect(out.forfeited).toEqual(["M6", "M7"]);
    expect(champion(out.bracket)).toBe("e4");
  });

  it("keeps a dropout out of every ready match through a whole double elimination", () => {
    let bracket = double(8);
    for (let pass = 0; pass < 32; pass++) {
      bracket = unwrap(forfeitWithdrawn(bracket, ["e5"])).bracket;
      const ready = bracket.matches.filter((m) => m.status === "ready");
      expect(ready.filter((m) => m.a.entrant === "e5" || m.b.entrant === "e5")).toEqual([]);
      const next = ready[0];
      if (!next) break;
      bracket = report(bracket, [next.code]);
    }
    expect(bracket.matches.some((m) => m.status === "ready")).toBe(false);
    expect(champion(bracket)).not.toBeNull();
    expect(BracketSchema.safeParse(bracket).success).toBe(true);
  });
});
