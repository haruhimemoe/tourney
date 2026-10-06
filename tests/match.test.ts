/**
 * @file tests/match.test.ts
 * @desc The stored match schema and score helpers.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  checkScore,
  type MapResult,
  type Match,
  MatchSchema,
  scoreFromMaps,
  teamTotals,
  winsNeeded,
} from "../src/match.js";

const MATCH: Match = {
  id: "665f1c2b9a1e4c0012345678",
  bracketCode: "M1",
  round: "RO16",
  a: "t1",
  b: "t2",
  bestOf: 9,
  status: "done",
  scheduledAt: "2026-08-08T18:00:00Z",
  scoreA: 5,
  scoreB: 3,
  winner: "a",
  mpLinks: ["https://osu.ppy.sh/community/matches/111"],
  streamUrl: null,
  vodUrl: "https://youtu.be/x",
  refereeIds: [1],
  streamerIds: [],
  commentatorIds: [2, 3],
  pickBans: [{ side: "a", action: "ban", slot: "b:DT#1" }],
  maps: [],
  reschedules: [{ from: null, to: "2026-08-08T18:00:00Z", at: "2026-08-01T00:00:00Z", by: null }],
  notes: null,
};

const map = (winner: "a" | "b" | null, extra: Partial<MapResult> = {}): MapResult => ({
  slot: "b:NM#1",
  winner,
  warmup: false,
  aborted: false,
  lineupA: [1, 2],
  lineupB: [3, 4],
  scores: [
    {
      osuId: 1,
      side: "a",
      score: 500_000,
      accuracy: 0.98,
      maxCombo: 900,
      misses: 1,
      mods: ["NF"],
      passed: true,
    },
    {
      osuId: 2,
      side: "a",
      score: 400_000,
      accuracy: 0.95,
      maxCombo: 700,
      misses: 3,
      mods: [],
      passed: true,
    },
    {
      osuId: 3,
      side: "b",
      score: 800_000,
      accuracy: 0.99,
      maxCombo: 1000,
      misses: 0,
      mods: [],
      passed: true,
    },
  ],
  ...extra,
});

describe("MatchSchema", () => {
  it("parses a full record and refuses non-http links", () => {
    expect(MatchSchema.parse({ ...MATCH, maps: [map("a")] }).maps).toHaveLength(1);
    expect(MatchSchema.safeParse({ ...MATCH, mpLinks: ["javascript:alert(1)"] }).success).toBe(
      false,
    );
    expect(MatchSchema.safeParse({ ...MATCH, scheduledAt: "2026-08-08" }).success).toBe(false);
  });
});

describe("scores", () => {
  it("needs a majority of the best-of", () => {
    expect([1, 7, 9, 13].map(winsNeeded)).toEqual([1, 4, 5, 7]);
    expect(checkScore(9, 5, 4)).toEqual({ ok: true, value: "a" });
    expect(checkScore(9, 0, 5)).toEqual({ ok: true, value: "b" });
    for (const [a, b] of [
      [5, 5],
      [4, 4],
      [6, 0],
      [-1, 5],
      [1.5, 5],
    ]) {
      expect(checkScore(9, a as number, b as number).ok).toBe(false);
    }
  });

  it("counts maps, skipping warmups and aborts", () => {
    const maps = [
      map("a"),
      map("b"),
      map("a", { warmup: true }),
      map("b", { aborted: true }),
      map(null),
      map("a"),
    ];
    expect(scoreFromMaps(maps)).toEqual({ a: 2, b: 1 });
  });

  it("sums team scores", () => {
    expect(teamTotals(map("a"))).toEqual({ a: 900_000, b: 800_000 });
  });
});
