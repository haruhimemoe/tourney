/**
 * @file tests/registration.test.ts
 * @desc Registration review table, role copying, conflicts and canRegister.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  canRegister,
  checkRoleConflicts,
  REGISTRATION_STATUSES,
  type Registration,
  RegistrationSchema,
  type RegistrationStatus,
  reviewRegistration,
} from "../src/registration.js";
import type { Tournament } from "../src/tournament.js";
import { freeze } from "./fixtures.js";

const REG: Registration = freeze({
  id: "r1",
  osuId: 1,
  kind: "staff",
  status: "pending",
  appliedRoles: ["referee", "streamer"],
  approvedRoles: [],
  availability: { slotMinutes: 60, slots: [10, 11] },
  createdAt: "2026-06-02T00:00:00Z",
});

const ALLOWED: Record<RegistrationStatus, RegistrationStatus[]> = {
  pending: ["approved", "waitlisted", "rejected", "withdrawn"],
  waitlisted: ["approved", "rejected", "withdrawn"],
  approved: ["withdrawn"],
  rejected: [],
  withdrawn: [],
};

describe("reviewRegistration", () => {
  it("parses", () => {
    expect(RegistrationSchema.parse(REG)).toEqual(REG);
  });

  for (const from of REGISTRATION_STATUSES) {
    for (const to of REGISTRATION_STATUSES) {
      const allowed = ALLOWED[from].includes(to);
      it(`${from} -> ${to} is ${allowed ? "allowed" : "refused"}`, () => {
        expect(reviewRegistration({ ...REG, status: from }, to).ok).toBe(allowed);
      });
    }
  }

  it("copies applied roles on approval only when none were set", () => {
    const approved = reviewRegistration(REG, "approved");
    expect(approved.ok && approved.value.approvedRoles).toEqual(["referee", "streamer"]);
    const chosen = reviewRegistration({ ...REG, approvedRoles: ["referee"] }, "approved");
    expect(chosen.ok && chosen.value.approvedRoles).toEqual(["referee"]);
    const player = reviewRegistration({ ...REG, kind: "player" }, "approved");
    expect(player.ok && player.value.approvedRoles).toEqual([]);
  });
});

describe("checkRoleConflicts", () => {
  const player = { ...REG, id: "p", kind: "player" as const, appliedRoles: [] };
  it("finds player plus mappooler, counting approved roles once decided", () => {
    const pooler = { ...REG, appliedRoles: ["mappooler"] };
    expect(checkRoleConflicts([player, pooler])).toEqual([["player", "mappooler"]]);
    expect(
      checkRoleConflicts([player, { ...pooler, status: "approved", approvedRoles: ["referee"] }]),
    ).toEqual([]);
    expect(checkRoleConflicts([player, { ...pooler, status: "withdrawn" }])).toEqual([]);
    expect(checkRoleConflicts([{ ...player, status: "rejected" }, pooler])).toEqual([]);
    expect(checkRoleConflicts([player, REG], [["player", "referee"]])).toEqual([
      ["player", "referee"],
    ]);
  });
});

describe("canRegister", () => {
  const T: Tournament = {
    id: "t",
    name: "T",
    code: "T",
    mode: "osu",
    phase: "registration",
    sides: { kind: "solo", lineup: 1, rosterMin: 1, rosterMax: 1, subsMax: 0 },
    registration: { opensAt: null, closesAt: "2026-07-01T00:00:00Z", playerCap: 2, staffCap: null },
  };
  const now = new Date("2026-06-15T00:00:00Z");

  it("checks the window and caps", () => {
    expect(canRegister(T, "player", { players: 1, staff: 0 }, now)).toEqual({
      ok: true,
      value: true,
    });
    expect(canRegister(T, "player", { players: 2, staff: 0 }, now)).toMatchObject({
      error: { code: "limit" },
    });
    expect(canRegister(T, "staff", { players: 2, staff: 99 }, now).ok).toBe(true);
    expect(canRegister(T, "player", { players: Number.NaN, staff: 0 }, now)).toMatchObject({
      error: { code: "bad-input" },
    });
    expect(
      canRegister(T, "staff", { players: 0, staff: 0 }, new Date("2026-07-02T00:00:00Z")),
    ).toMatchObject({
      error: { code: "closed" },
    });
  });
});
