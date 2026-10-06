/**
 * @file tests/schedule.test.ts
 * @desc Suggested match times (overlap, higher seed tiebreak, refusals) and reschedule rules.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import type { Match } from "../src/match.js";
import { checkReschedule, type RescheduleRules, suggestMatchTimes } from "../src/schedule.js";
import { freeze, unwrap } from "./fixtures.js";

// Week slots are hours from Monday 00:00 UTC. 2026-08-03 is a Monday.
const grid = (slots: number[]) => ({ slotMinutes: 60, slots });
const WINDOW = { start: new Date("2026-08-03T00:00:00Z"), end: new Date("2026-08-10T00:00:00Z") };

describe("suggestMatchTimes", () => {
  it("finds the overlap", () => {
    const result = unwrap(
      suggestMatchTimes({
        a: { id: "A", seed: 1, members: [{ id: "1", availability: grid([18, 19, 20]) }] },
        b: { id: "B", seed: 2, members: [{ id: "2", availability: grid([19, 20, 21]) }] },
        window: WINDOW,
        lengthMinutes: 120,
      }),
    );
    expect(result[0]?.start.toISOString()).toBe("2026-08-03T19:00:00.000Z");
    expect(result[0]?.readySides).toBe(2);
  });

  it("breaks ties toward the higher seed's free players", () => {
    // Two one-hour starts, each with 3 free players: at 10 the high seed (B) has two free, at 30 one.
    const a = {
      id: "A",
      seed: 5,
      need: 1,
      members: [
        { id: "a1", availability: grid([10, 30]) },
        { id: "a2", availability: grid([30]) },
      ],
    };
    const b = {
      id: "B",
      seed: 1,
      need: 1,
      members: [
        { id: "b1", availability: grid([10, 30]) },
        { id: "b2", availability: grid([10]) },
      ],
    };
    const result = unwrap(
      suggestMatchTimes(
        freeze({ a, b, window: WINDOW, lengthMinutes: 60, limit: 2, staff: [], staffNeed: 0 }),
      ),
    );
    expect(result.map((c) => c.start.getUTCHours())).toEqual([10, 6]);
    const flipped = unwrap(
      suggestMatchTimes({
        a: { ...a, seed: 1 },
        b: { ...b, seed: null },
        window: WINDOW,
        lengthMinutes: 60,
        limit: 2,
      }),
    );
    expect(flipped.map((c) => c.start.getUTCHours())).toEqual([6, 10]);
  });

  it("returns bad-input when time refuses", () => {
    const side = { id: "A", seed: 1, members: [] };
    expect(
      suggestMatchTimes({
        a: side,
        b: { ...side, id: "B" },
        window: { start: WINDOW.end, end: WINDOW.start },
        lengthMinutes: 60,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "bad-input" },
    });
  });
});

describe("checkReschedule", () => {
  const rules: RescheduleRules = { window: WINDOW, maxReschedules: 1, minNoticeHours: 24 };
  type Scheduled = Pick<Match, "status" | "scheduledAt" | "reschedules">;
  const match: Scheduled = freeze({
    status: "scheduled" as const,
    scheduledAt: "2026-08-08T18:00:00Z",
    reschedules: [{ from: null, to: "2026-08-08T18:00:00Z", at: "2026-08-01T00:00:00Z", by: null }],
  });
  const now = new Date("2026-08-04T00:00:00Z");

  it("accepts a time in the window with notice", () => {
    const to = new Date("2026-08-07T18:00:00Z");
    expect(checkReschedule(match, to, rules, now)).toEqual({ ok: true, value: to });
  });

  it("refuses invalid rules", () => {
    const to = new Date("2026-08-07T18:00:00Z");
    expect(checkReschedule(match, to, { ...rules, maxReschedules: Number.NaN }, now)).toMatchObject(
      { error: { code: "bad-input" } },
    );
    expect(checkReschedule(match, to, { ...rules, minNoticeHours: -1 }, now)).toMatchObject({
      error: { code: "bad-input" },
    });
  });

  it.each<[string, Partial<Scheduled> | null, string, string]>([
    ["not scheduled", { status: "done" }, "2026-08-07T18:00:00Z", "bad-state"],
    ["bad date", null, "nope", "bad-input"],
    ["before window", null, "2026-08-02T18:00:00Z", "bad-input"],
    ["at window end", null, "2026-08-10T00:00:00Z", "bad-input"],
    ["new time too soon", null, "2026-08-04T12:00:00Z", "closed"],
    [
      "old time too soon",
      { scheduledAt: "2026-08-04T10:00:00Z" },
      "2026-08-07T18:00:00Z",
      "closed",
    ],
    [
      "too many",
      {
        reschedules: [
          {
            from: "2026-08-06T18:00:00Z",
            to: "2026-08-08T18:00:00Z",
            at: "2026-08-02T00:00:00Z",
            by: 1,
          },
        ],
      },
      "2026-08-07T18:00:00Z",
      "limit",
    ],
  ])("refuses %s", (_, change, to, code) => {
    expect(checkReschedule({ ...match, ...change }, new Date(to), rules, now)).toMatchObject({
      ok: false,
      error: { code },
    });
  });
});
