/**
 * @file tests/egc2026.test.ts
 * @desc The EGC 2026 shape end to end, as a backfill would build it: 16 drafted 3v3 teams seeded
 *       from qualifiers, double elimination with the 2026 best-ofs, every match stored as a
 *       MatchSchema record, a champion at the end.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { createBracket } from "../src/bracket.js";
import { champion } from "../src/bracket-report.js";
import { draftOrder } from "../src/draft.js";
import { type Match, MatchSchema } from "../src/match.js";
import { rankQualifiers } from "../src/seeding.js";
import { checkTeam, type SideRules } from "../src/team.js";
import { playOut, rng, unwrap } from "./fixtures.js";

const SIDES: SideRules = { kind: "team", lineup: 3, rosterMin: 3, rosterMax: 3, subsMax: 0 };
const BEST_OF = { default: 9, rounds: { SF: 11, F: 13, LR5: 11, LR6: 13, GF: 13 } };

describe("EGC 2026", () => {
  const random = rng(2026);
  const teams = Array.from({ length: 16 }, (_, i) => ({
    id: `team${i + 1}`,
    name: `Team ${i + 1}`,
    tag: null,
    captainId: 100 + i,
    roster: [100 + i, 200 + i, 300 + i],
    subs: [],
    seed: null,
  }));
  const qualifiers = teams.map((t) => ({
    entrantId: t.id,
    scores: Array.from({ length: 8 }, () => Math.round(random() * 1_000_000)),
  }));

  it("drafts 16 captains, 2 picks each, worst seed first", () => {
    const order = draftOrder(16, SIDES.rosterMax - 1, { order: "snake", worstFirst: true });
    expect(order.slice(0, 3)).toEqual([16, 15, 14]);
    expect(order.slice(15, 18)).toEqual([1, 1, 2]);
    expect(order).toHaveLength(32);
    for (const team of teams) expect(checkTeam(team, SIDES).ok).toBe(true);
  });

  it("seeds from qualifiers, plays out and stores every match", () => {
    const seeds = rankQualifiers(qualifiers, "average-rank");
    const bracket = unwrap(
      createBracket({ entrants: seeds.map((s) => s.entrantId), format: "double", bestOf: BEST_OF }),
    );
    expect(bracket.rounds.map((r) => r.code)).toEqual([
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
    expect(bracket.matches).toHaveLength(30);
    const { bracket: done } = playOut(bracket, () => (random() < 0.5 ? "a" : "b"));
    expect(champion(done)).not.toBeNull();
    const records: Match[] = done.matches.map((m, i) => ({
      id: `m${i}`,
      bracketCode: m.code,
      round: m.round,
      a: m.a.entrant,
      b: m.b.entrant,
      bestOf: m.bestOf,
      status: "done",
      scheduledAt: "2026-08-08T18:00:00Z",
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      winner: m.winner,
      mpLinks: [`https://osu.ppy.sh/community/matches/${1000 + i}`],
      streamUrl: null,
      vodUrl: null,
      refereeIds: [1],
      streamerIds: [],
      commentatorIds: [],
      pickBans: [],
      maps: [],
      reschedules: [],
      notes: null,
    }));
    for (const record of records) expect(MatchSchema.parse(record)).toEqual(record);
    expect(records.find((r) => r.round === "GF")?.bestOf).toBe(13);
    expect(records.find((r) => r.round === "LR2")?.bestOf).toBe(9);
  });
});
