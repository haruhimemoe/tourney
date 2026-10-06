/**
 * @file tests/bracket-report.test.ts
 * @desc Progression: full runs to a champion for every size and format, loss counts, the grand
 *       final reset both ways, forfeits, clearing, refusals, lookups and no mutation.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { createBracket } from "../src/bracket.js";
import {
  champion,
  clearResult,
  matchesFor,
  nextMatch,
  reportForfeit,
  reportResult,
} from "../src/bracket-report.js";
import { entrants, freeze, losses, playOut, rng, unwrap } from "./fixtures.js";

const SIZES = Array.from({ length: 63 }, (_, i) => i + 2);

describe("full runs", () => {
  it.each(SIZES)(
    "single elimination with %i entrants crowns one, everyone else loses once",
    (size) => {
      const random = rng(size);
      const start = unwrap(
        createBracket({ entrants: entrants(size), format: "single", bestOf: 7 }),
      );
      const { bracket, played } = playOut(start, () => (random() < 0.5 ? "a" : "b"));
      const winner = champion(bracket);
      expect(winner).not.toBeNull();
      const lost = losses(played);
      expect(lost.has(winner as string)).toBe(false);
      expect(lost.size).toBe(size - 1);
      expect([...lost.values()].every((n) => n === 1)).toBe(true);
      expect(bracket.matches.every((m) => ["done", "bye"].includes(m.status))).toBe(true);
    },
  );

  it.each(SIZES)(
    "double elimination with %i entrants: champion loses at most once, others twice",
    (size) => {
      const random = rng(size * 7);
      const start = unwrap(
        createBracket({
          entrants: entrants(size),
          format: "double",
          bestOf: 5,
          grandFinalReset: true,
        }),
      );
      const { bracket, played } = playOut(start, () => (random() < 0.5 ? "a" : "b"));
      const winner = champion(bracket) as string;
      expect(winner).not.toBeNull();
      const lost = losses(played);
      expect(lost.get(winner) ?? 0).toBeLessThanOrEqual(1);
      for (const id of entrants(size)) if (id !== winner) expect(lost.get(id)).toBe(2);
      expect(bracket.matches.every((m) => ["done", "bye", "skipped"].includes(m.status))).toBe(
        true,
      );
    },
  );

  it("feeds qualifier seeds into a bracket: higher seeds always winning crowns seed 1", () => {
    const start = unwrap(createBracket({ entrants: entrants(12), format: "double", bestOf: 7 }));
    const seedOf = (id: string | null) => Number(id?.slice(1));
    const { bracket } = playOut(start, (m) =>
      seedOf(m.a.entrant) < seedOf(m.b.entrant) ? "a" : "b",
    );
    expect(champion(bracket)).toBe("e1");
  });
});

describe("grand final", () => {
  const toGrandFinal = (reset: boolean) => {
    const start = unwrap(
      createBracket({ entrants: entrants(4), format: "double", bestOf: 7, grandFinalReset: reset }),
    );
    // Higher seed wins everything before the GF: e1 from winners, e2 from losers.
    let b = start;
    for (
      let m = b.matches.find((x) => x.status === "ready" && x.round !== "GF");
      m;
      m = b.matches.find((x) => x.status === "ready" && x.round !== "GF")
    ) {
      const aWins = Number(m.a.entrant?.slice(1)) < Number(m.b.entrant?.slice(1));
      b = unwrap(
        reportResult(b, m.code, aWins ? { scoreA: 4, scoreB: 0 } : { scoreA: 0, scoreB: 4 }),
      );
    }
    const gf = b.matches.find((m) => m.round === "GF");
    expect(gf).toMatchObject({ status: "ready", a: { entrant: "e1" }, b: { entrant: "e2" } });
    return { b, gf: gf?.code as string };
  };

  it("skips the reset when the winners side wins", () => {
    const { b, gf } = toGrandFinal(true);
    const done = unwrap(reportResult(b, gf, { scoreA: 4, scoreB: 2 }));
    expect(done.matches.find((m) => m.round === "GFR")?.status).toBe("skipped");
    expect(champion(done)).toBe("e1");
  });

  it("plays the reset when the losers side wins, and the losers side can take it", () => {
    const { b, gf } = toGrandFinal(true);
    const reset = unwrap(reportResult(b, gf, { scoreA: 1, scoreB: 4 }));
    const gfr = reset.matches.find((m) => m.round === "GFR");
    expect(gfr).toMatchObject({ status: "ready", a: { entrant: "e2" }, b: { entrant: "e1" } });
    expect(champion(reset)).toBeNull();
    const done = unwrap(reportResult(reset, gfr?.code as string, { scoreA: 4, scoreB: 3 }));
    expect(champion(done)).toBe("e2");
    const played = done.matches.filter((m) => m.status === "done");
    expect(losses(played).get("e1")).toBe(2);
    expect(losses(played).get("e2")).toBe(1);
  });

  it("crowns the GF winner without a reset", () => {
    const { b, gf } = toGrandFinal(false);
    expect(champion(unwrap(reportResult(b, gf, { scoreA: 0, scoreB: 4 })))).toBe("e2");
  });

  it("clearing GF puts the reset back to pending; a played reset blocks it", () => {
    const { b, gf } = toGrandFinal(true);
    const reset = unwrap(reportResult(b, gf, { scoreA: 1, scoreB: 4 }));
    const cleared = unwrap(clearResult(reset, gf));
    expect(cleared.matches.find((m) => m.round === "GFR")?.status).toBe("pending");
    const gfr = reset.matches.find((m) => m.round === "GFR")?.code as string;
    const played = unwrap(reportResult(reset, gfr, { scoreA: 4, scoreB: 0 }));
    expect(clearResult(played, gf)).toMatchObject({ ok: false, error: { code: "out-of-order" } });
  });
});

describe("reporting", () => {
  const start = freeze(
    unwrap(createBracket({ entrants: entrants(4), format: "single", bestOf: 7 })),
  );

  it("refuses unknown, pending and bad scores, and never mutates", () => {
    expect(reportResult(start, "M9", { scoreA: 4, scoreB: 0 })).toMatchObject({
      error: { code: "not-found" },
    });
    expect(reportResult(start, "M3", { scoreA: 4, scoreB: 0 })).toMatchObject({
      error: { code: "bad-state" },
    });
    for (const [scoreA, scoreB] of [
      [4, 4],
      [3, 2],
      [5, 0],
      [-1, 4],
      [4.5, 0],
    ]) {
      expect(
        reportResult(start, "M1", { scoreA, scoreB } as { scoreA: number; scoreB: number }),
      ).toMatchObject({
        error: { code: "bad-score" },
      });
    }
    const once = unwrap(reportResult(start, "M1", { scoreA: 4, scoreB: 1 }));
    expect(reportResult(once, "M1", { scoreA: 4, scoreB: 1 })).toMatchObject({
      error: { code: "bad-state" },
    });
    expect(start.matches[0]?.status).toBe("ready");
  });

  it("forfeits advance the named side without scores", () => {
    const b = unwrap(reportForfeit(start, "M1", "b"));
    expect(b.matches[0]).toMatchObject({
      status: "forfeit",
      winner: "b",
      scoreA: null,
      scoreB: null,
    });
    expect(b.matches[2]?.a.entrant).toBe("e4");
    expect(reportForfeit(start, "M1", "c" as "a")).toMatchObject({ error: { code: "bad-input" } });
    expect(reportForfeit(start, "M3", "a")).toMatchObject({ error: { code: "bad-state" } });
  });

  it("clears in reverse order only, and never a bye", () => {
    let b = unwrap(reportResult(start, "M1", { scoreA: 4, scoreB: 0 }));
    b = unwrap(reportResult(b, "M2", { scoreA: 4, scoreB: 0 }));
    b = unwrap(reportResult(b, "M3", { scoreA: 4, scoreB: 0 }));
    expect(clearResult(b, "M1")).toMatchObject({ error: { code: "out-of-order" } });
    b = unwrap(clearResult(b, "M3"));
    b = unwrap(clearResult(b, "M1"));
    expect(b.matches.map((m) => m.status)).toEqual(["ready", "done", "pending"]);
    expect(b.matches[2]?.a).toMatchObject({ entrant: null, settled: false });
    expect(clearResult(b, "M1")).toMatchObject({ error: { code: "bad-state" } });
    expect(clearResult(b, "M7")).toMatchObject({ error: { code: "not-found" } });
    const byes = unwrap(createBracket({ entrants: entrants(3), format: "single", bestOf: 7 }));
    expect(clearResult(byes, "M1")).toMatchObject({ error: { code: "bad-state" } });
  });

  it("finds an entrant's matches and next match", () => {
    const b = unwrap(reportResult(start, "M1", { scoreA: 4, scoreB: 0 }));
    expect(matchesFor(b, "e1").map((m) => m.code)).toEqual(["M1", "M3"]);
    expect(nextMatch(b, "e1")).toBeNull();
    expect(nextMatch(b, "e2")?.code).toBe("M2");
    expect(nextMatch(b, "e4")).toBeNull();
    expect(champion(b)).toBeNull();
  });
});
