/**
 * @file tests/draft.test.ts
 * @desc Draft order (EGC's reverse-start snake among others), the clock, picks and deadlines.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  type Draft,
  DraftSchema,
  draftOrder,
  makePick,
  onTheClock,
  pickDeadline,
} from "../src/draft.js";

/** EGC's buildSnakeOrder, restated: round 1 runs N..1, then it snakes. */
const egcSnake = (teams: number, rounds: number): number[] =>
  Array.from({ length: rounds }, (_, r) =>
    Array.from({ length: teams }, (_, i) => (r % 2 === 0 ? teams - i : i + 1)),
  ).flat();

const DRAFT: Draft = {
  order: "snake",
  worstFirst: true,
  captains: ["c1", "c2", "c3"],
  picksPerTeam: 2,
  pickSeconds: 60,
  picks: [],
};
const POOL = [10, 11, 12, 13, 14, 15, 16];
const NOW = new Date("2026-07-15T18:00:00Z");

describe("draftOrder", () => {
  it("matches EGC 2026 (16 captains, 2 picks each)", () => {
    expect(draftOrder(16, 2, { order: "snake", worstFirst: true })).toEqual(egcSnake(16, 2));
  });

  it("does linear and best-first", () => {
    expect(draftOrder(3, 2, { order: "linear", worstFirst: false })).toEqual([1, 2, 3, 1, 2, 3]);
    expect(draftOrder(3, 2, { order: "snake", worstFirst: false })).toEqual([1, 2, 3, 3, 2, 1]);
    expect(draftOrder(3, 2, { order: "linear", worstFirst: true })).toEqual([3, 2, 1, 3, 2, 1]);
  });

  it("is empty for bad counts", () => {
    expect(draftOrder(2.5, 2, DRAFT)).toEqual([]);
    expect(draftOrder(0, 2, DRAFT)).toEqual([]);
  });
});

describe("picks", () => {
  it("runs a whole draft in order", () => {
    let draft = DraftSchema.parse(DRAFT);
    const seen: string[] = [];
    let player = 10;
    for (let clock = onTheClock(draft); clock; clock = onTheClock(draft)) {
      seen.push(clock.captain);
      const next = makePick(draft, clock.captain, player++, { pool: POOL, now: NOW });
      if (!next.ok) throw new Error(next.error.message);
      draft = next.value;
    }
    expect(seen).toEqual(["c3", "c2", "c1", "c1", "c2", "c3"]);
    expect(makePick(draft, "c1", 16, { pool: POOL, now: NOW })).toMatchObject({
      ok: false,
      error: { code: "closed" },
    });
    expect(pickDeadline(draft, NOW)).toBeNull();
    expect(DRAFT.picks).toEqual([]);
  });

  it("reports rounds", () => {
    const one = makePick(DRAFT, "c3", 10, { pool: POOL, now: NOW });
    if (!one.ok) throw new Error("pick failed");
    expect(onTheClock(one.value)).toEqual({ overall: 1, round: 1, captain: "c2" });
  });

  it("refuses the wrong captain, unknown or taken players and bad times", () => {
    expect(makePick(DRAFT, "c1", 10, { pool: POOL, now: NOW }).ok).toBe(false);
    expect(makePick(DRAFT, "c3", 99, { pool: POOL, now: NOW }).ok).toBe(false);
    expect(makePick(DRAFT, "c3", 10, { pool: POOL, now: new Date(Number.NaN) }).ok).toBe(false);
    const one = makePick(DRAFT, "c3", 10, { pool: POOL, now: NOW });
    if (!one.ok) throw new Error("pick failed");
    expect(makePick(one.value, "c2", 10, { pool: POOL, now: NOW })).toMatchObject({
      ok: false,
      error: { code: "bad-input" },
    });
  });

  it("counts the deadline from the start, then from the last pick", () => {
    expect(pickDeadline(DRAFT, NOW)?.toISOString()).toBe("2026-07-15T18:01:00.000Z");
    const later = new Date("2026-07-15T18:00:30Z");
    const one = makePick(DRAFT, "c3", 10, { pool: POOL, now: later });
    if (!one.ok) throw new Error("pick failed");
    expect(pickDeadline(one.value, NOW)?.toISOString()).toBe("2026-07-15T18:01:30.000Z");
  });
});
