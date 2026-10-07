/**
 * @file tests/standings.test.ts
 * @desc groupStandings: points, forfeits, byes, every tiebreak (a three-way head to head, map
 *       difference, maps won), seed as the last word, unplayed matches skipped, bad input.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_STANDINGS_RULES,
  type GroupMatch,
  groupStandings,
  type StandingsRules,
} from "../src/standings.js";
import { freeze, unwrap } from "./fixtures.js";

const win = (a: string, b: string, scoreA: number, scoreB: number): GroupMatch => ({
  a,
  b,
  status: "done",
  scoreA,
  scoreB,
  winner: scoreA > scoreB ? "a" : "b",
});
const order = (rows: { entrantId: string }[]) => rows.map((r) => r.entrantId);

describe("groupStandings", () => {
  it("counts points, maps and records, skipping unplayed matches", () => {
    const rows = unwrap(
      groupStandings(
        ["x", "y", "z"],
        freeze([
          win("x", "y", 3, 1),
          win("y", "z", 3, 2),
          win("x", "z", 3, 0),
          { a: "z", b: "x", status: "scheduled", scoreA: null, scoreB: null, winner: null },
        ]),
      ),
    );
    expect(rows[0]).toEqual({
      entrantId: "x",
      place: 1,
      played: 2,
      wins: 2,
      losses: 0,
      mapsWon: 6,
      mapsLost: 1,
      points: 2,
      tied: false,
    });
    expect(order(rows)).toEqual(["x", "y", "z"]);
  });

  it("gives forfeit losers forfeitLoss and no maps", () => {
    const rules: StandingsRules = { points: { win: 3, loss: 1, forfeitLoss: -1 }, tiebreaks: [] };
    const rows = unwrap(
      groupStandings(
        ["x", "y", "z"],
        [
          { a: "x", b: "y", status: "forfeit", scoreA: null, scoreB: null, winner: "a" },
          win("y", "z", 1, 3),
        ],
        rules,
      ),
    );
    expect(rows.map((r) => [r.entrantId, r.points, r.mapsWon])).toEqual([
      ["x", 3, 0],
      ["z", 3, 3],
      ["y", 0, 1],
    ]);
    expect(rows[0]?.tied).toBe(true);
  });

  it("breaks a three-way tie on head to head among the tied only", () => {
    // p, q, r beat each other in a circle; p and q beat s, r lost to s.
    const matches = [
      win("p", "q", 3, 0),
      win("q", "r", 3, 0),
      win("r", "p", 3, 0),
      win("p", "s", 3, 0),
      win("q", "s", 3, 0),
      win("s", "r", 3, 2),
    ];
    const rows = unwrap(
      groupStandings(["s", "r", "q", "p"], matches, {
        ...DEFAULT_STANDINGS_RULES,
        tiebreaks: ["head-to-head"],
      }),
    );
    // p and q on 2 points; head to head between just them: p beat q.
    expect(order(rows)).toEqual(["p", "q", "s", "r"]);
    expect(rows.every((r) => !r.tied)).toBe(true);
  });

  it("falls through head to head to map difference, then maps won, then seed", () => {
    const circle = [win("p", "q", 3, 2), win("q", "r", 3, 0), win("r", "p", 3, 1)];
    // Everyone 1-1, head to head all 1. Diffs: p -1, q +2, r -1. Maps won: p 4, r 3.
    const rows = unwrap(groupStandings(["p", "q", "r"], circle));
    expect(order(rows)).toEqual(["q", "p", "r"]);
    expect(rows.every((r) => !r.tied)).toBe(true);
    const flat = unwrap(
      groupStandings(["r", "q", "p"], circle, { ...DEFAULT_STANDINGS_RULES, tiebreaks: [] }),
    );
    expect(order(flat)).toEqual(["r", "q", "p"]);
    expect(flat.every((r) => r.tied)).toBe(true);
    expect(flat.map((r) => r.place)).toEqual([1, 2, 3]);
  });

  it("counts byes as wins with no maps", () => {
    const rows = unwrap(groupStandings(["x", "y"], [], DEFAULT_STANDINGS_RULES, { byes: ["y"] }));
    expect(rows[0]).toMatchObject({ entrantId: "y", wins: 1, points: 1, played: 0, mapsWon: 0 });
  });

  it.each([
    [["x", "x"], [], DEFAULT_STANDINGS_RULES, {}],
    [["x", "y"], [win("x", "nope", 3, 0)], DEFAULT_STANDINGS_RULES, {}],
    [["x", "y"], [win("x", "x", 3, 0)], DEFAULT_STANDINGS_RULES, {}],
    [
      ["x", "y"],
      [],
      { ...DEFAULT_STANDINGS_RULES, points: { win: 1.5, loss: 0, forfeitLoss: 0 } },
      {},
    ],
    [["x", "y"], [], DEFAULT_STANDINGS_RULES, { byes: ["nope"] }],
  ])("refuses bad input %#", (ids, matches, rules, extra) => {
    expect(groupStandings(ids, matches, rules as StandingsRules, extra)).toMatchObject({
      ok: false,
      error: { code: "bad-input" },
    });
  });
});
