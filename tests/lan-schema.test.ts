/**
 * @file tests/lan-schema.test.ts
 * @desc deriveAttendeeKind over registration kinds and statuses, LanRegistrationSchema extended
 *       with an app field, and roomShares in whole units with its refusals.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { deriveAttendeeKind, LanRegistrationSchema, roomShares } from "../src/lan-schema.js";
import type { RegistrationStatus } from "../src/registration.js";

const reg = (kind: "player" | "staff", status: RegistrationStatus) => ({ kind, status });

describe("deriveAttendeeKind", () => {
  it("is attendee with no registrations", () => {
    expect(deriveAttendeeKind([])).toBe("attendee");
  });

  it("is staff once a staff registration is approved, over a pending player one", () => {
    expect(deriveAttendeeKind([reg("player", "pending"), reg("staff", "approved")])).toBe("staff");
  });

  it("is attendee for a pending staff registration alone", () => {
    expect(deriveAttendeeKind([reg("staff", "pending")])).toBe("attendee");
  });

  it.each(["pending", "approved", "waitlisted"] as const)("is player when %s to play", (status) => {
    expect(deriveAttendeeKind([reg("player", status)])).toBe("player");
  });

  it.each(["rejected", "withdrawn"] as const)("is attendee when %s as a player", (status) => {
    expect(deriveAttendeeKind([reg("player", status)])).toBe("attendee");
  });
});

describe("LanRegistrationSchema", () => {
  const EditionSignup = LanRegistrationSchema.extend({ editionId: z.string() });
  const row = {
    id: "l1",
    osuId: 2,
    kind: "player",
    status: "pending",
    submittedAt: "2026-09-01T00:00:00Z",
    room: "twin",
    roommateId: "l2",
    pairCode: "K7QX2M",
    hasCompanion: true,
    editionId: "egc2026",
  };

  it("parses a full row with an app field", () => {
    expect(EditionSignup.parse(row)).toEqual(row);
  });

  it.each([
    ["a pair code with a 0", { pairCode: "ABCDE0" }],
    ["a registration status", { status: "approved" }],
  ])("refuses %s", (_, change) => {
    expect(EditionSignup.safeParse({ ...row, ...change }).success).toBe(false);
  });
});

describe("roomShares", () => {
  it("splits in whole units, the first payer taking what doesn't divide", () => {
    expect(roomShares(10001, 2)).toEqual([5001, 5000]);
    expect(roomShares(0, 2)).toEqual([0, 0]);
    expect(roomShares(10000, 1)).toEqual([10000]);
    expect(roomShares(101, 3)).toEqual([35, 33, 33]);
  });

  it.each([
    [100, 0],
    [10.5, 2],
    [-100, 2],
    [Number.NaN, 2],
    [100, 1.5],
    [100, 1001],
  ])("refuses %s split %s ways", (price, payers) => {
    expect(roomShares(price, payers)).toEqual([]);
  });
});
