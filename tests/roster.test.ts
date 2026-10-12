/**
 * @file tests/roster.test.ts
 * @desc Roster rules: free changes before the lock (or with none), counted ones from the lock on
 *       for the approver, the change limit, refusals, the frozen defaults and an extended schema.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  checkRosterChange,
  DEFAULT_ROSTER_RULES,
  type RosterRules,
  RosterRulesSchema,
} from "../src/roster.js";
import { freeze } from "./fixtures.js";

const LOCK = "2026-10-01T00:00:00Z";
const RULES: RosterRules = freeze({ lockAt: LOCK, maxChanges: 1, approver: "admin" });
const AT_LOCK = new Date(LOCK);
const FREE = { ok: true, value: { counted: false, approval: "captain" } };

describe("checkRosterChange", () => {
  it("leaves every change to the captain, uncounted, with no lock", () => {
    for (const changes of [0, 1, 16, 100]) {
      expect(checkRosterChange({ ...RULES, lockAt: null }, { now: AT_LOCK, changes })).toEqual(
        FREE,
      );
    }
  });

  it("leaves every change to the captain, uncounted, until the lock", () => {
    const minuteBefore = new Date(Date.parse(LOCK) - 60_000);
    for (const changes of [0, 1, 16, 100]) {
      expect(checkRosterChange(RULES, { now: minuteBefore, changes })).toEqual(FREE);
    }
  });

  it("counts a change from the lock on and sends it to the approver", () => {
    const counted = { ok: true, value: { counted: true, approval: "admin" } };
    expect(checkRosterChange(RULES, { now: AT_LOCK, changes: 0 })).toEqual(counted);
    expect(checkRosterChange(RULES, { now: new Date("2026-10-09T18:30:00Z"), changes: 0 })).toEqual(
      counted,
    );
    expect(
      checkRosterChange({ ...RULES, approver: "captain" }, { now: AT_LOCK, changes: 0 }),
    ).toEqual({ ok: true, value: { counted: true, approval: "captain" } });
  });

  it("refuses a change past maxChanges once locked", () => {
    expect(checkRosterChange(RULES, { now: AT_LOCK, changes: 1 })).toMatchObject({
      ok: false,
      error: { code: "limit" },
    });
    expect(
      checkRosterChange({ ...RULES, maxChanges: 0 }, { now: AT_LOCK, changes: 0 }),
    ).toMatchObject({ ok: false, error: { code: "limit" } });
  });

  it.each<[string, RosterRules, { now: Date; changes: number }]>([
    ["maxChanges 17", { ...RULES, maxChanges: 17 }, { now: AT_LOCK, changes: 0 }],
    ["approver host", { ...RULES, approver: "host" as "admin" }, { now: AT_LOCK, changes: 0 }],
    ["a lockAt that isn't an instant", { ...RULES, lockAt: "soon" }, { now: AT_LOCK, changes: 0 }],
    ["an invalid now", RULES, { now: new Date("x"), changes: 0 }],
    ["changes -1", RULES, { now: AT_LOCK, changes: -1 }],
    ["changes 1.5", RULES, { now: AT_LOCK, changes: 1.5 }],
  ])("refuses %s as bad-input", (_, rules, ctx) => {
    expect(checkRosterChange(rules, ctx)).toMatchObject({
      ok: false,
      error: { code: "bad-input" },
    });
  });
});

describe("RosterRulesSchema", () => {
  it("parses the defaults, which are frozen: no lock, one change, admin approval", () => {
    expect(RosterRulesSchema.parse(DEFAULT_ROSTER_RULES)).toEqual({
      lockAt: null,
      maxChanges: 1,
      approver: "admin",
    });
    expect(Object.isFrozen(DEFAULT_ROSTER_RULES)).toBe(true);
  });

  it("extends", () => {
    const Extended = RosterRulesSchema.extend({ note: z.string() });
    expect(Extended.parse({ ...RULES, note: "subs only" })).toEqual({
      ...RULES,
      note: "subs only",
    });
  });
});
