/**
 * @file tests/tournament.test.ts
 * @desc Tournament schema, the registration window and forward-only phases.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  advancePhase,
  isRegistrationOpen,
  type Tournament,
  TournamentSchema,
} from "../src/tournament.js";

const T: Tournament = {
  id: "egc2026",
  name: "Evergreen Cup 2026",
  code: "EGC2026",
  mode: "osu",
  phase: "registration",
  sides: { kind: "team", lineup: 3, rosterMin: 3, rosterMax: 3, subsMax: 0 },
  registration: {
    opensAt: "2026-06-01T00:00:00Z",
    closesAt: "2026-07-01T00:00:00Z",
    playerCap: null,
    staffCap: 40,
  },
};

describe("TournamentSchema", () => {
  it("parses", () => {
    expect(TournamentSchema.parse(T)).toEqual(T);
  });
});

describe("isRegistrationOpen", () => {
  it.each([
    ["2026-05-31T23:59:59Z", false],
    ["2026-06-01T00:00:00Z", true],
    ["2026-06-30T23:59:59Z", true],
    ["2026-07-01T00:00:00Z", false],
  ])("at %s is %s", (at, open) => {
    expect(isRegistrationOpen(T, new Date(at))).toBe(open);
  });

  it("treats null bounds as open and other phases as closed", () => {
    const open = { ...T, registration: { ...T.registration, opensAt: null, closesAt: null } };
    expect(isRegistrationOpen(open, new Date(0))).toBe(true);
    expect(isRegistrationOpen({ ...open, phase: "setup" }, new Date(0))).toBe(false);
    expect(isRegistrationOpen(open, new Date(Number.NaN))).toBe(false);
  });
});

describe("advancePhase", () => {
  it("moves forward and may skip", () => {
    expect(advancePhase(T, "bracket")).toEqual({ ok: true, value: { ...T, phase: "bracket" } });
    expect(T.phase).toBe("registration");
  });

  it("refuses going back, staying, and leaving done", () => {
    expect(advancePhase(T, "setup").ok).toBe(false);
    expect(advancePhase(T, "registration").ok).toBe(false);
    expect(advancePhase({ ...T, phase: "done" }, "bracket").ok).toBe(false);
  });
});
