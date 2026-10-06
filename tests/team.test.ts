/**
 * @file tests/team.test.ts
 * @desc Side rules, team and lineup checks, and team name helpers.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  checkLineup,
  checkSideRules,
  checkTeam,
  type SideRules,
  type Team,
  TeamSchema,
  teamNameKey,
  uniqueTeamName,
} from "../src/team.js";

const RULES: SideRules = { kind: "team", lineup: 3, rosterMin: 3, rosterMax: 4, subsMax: 2 };
const TEAM: Team = {
  id: "t1",
  name: "Moss",
  tag: "MOSS",
  captainId: 1,
  roster: [1, 2, 3],
  subs: [4],
  seed: 1,
};

describe("checkSideRules", () => {
  it("accepts sane rules and solo", () => {
    expect(checkSideRules(RULES).ok).toBe(true);
    expect(
      checkSideRules({ kind: "solo", lineup: 1, rosterMin: 1, rosterMax: 1, subsMax: 0 }).ok,
    ).toBe(true);
  });

  it.each<[string, SideRules]>([
    ["min above max", { ...RULES, rosterMin: 5 }],
    ["lineup too big", { ...RULES, lineup: 7 }],
    ["solo with subs", { kind: "solo", lineup: 1, rosterMin: 1, rosterMax: 1, subsMax: 1 }],
    ["solo with two", { kind: "solo", lineup: 1, rosterMin: 1, rosterMax: 2, subsMax: 0 }],
    ["solo lineup 2", { kind: "solo", lineup: 2, rosterMin: 1, rosterMax: 1, subsMax: 1 }],
  ])("refuses %s", (_, rules) => {
    expect(checkSideRules(rules)).toMatchObject({ ok: false, error: { code: "bad-input" } });
  });
});

describe("checkTeam", () => {
  it("accepts a valid team and parses", () => {
    expect(checkTeam(TEAM, RULES)).toEqual({ ok: true, value: TEAM });
    expect(TeamSchema.parse(TEAM)).toEqual(TEAM);
  });

  it.each<[string, Partial<Team>]>([
    ["captain off roster", { captainId: 9 }],
    ["duplicate", { subs: [3] }],
    ["roster too small", { roster: [1, 2] }],
    ["roster too big", { roster: [1, 2, 3, 5, 6] }],
    ["too many subs", { subs: [4, 5, 6] }],
  ])("refuses %s", (_, change) => {
    expect(checkTeam({ ...TEAM, ...change }, RULES)).toMatchObject({
      ok: false,
      error: { code: "bad-side" },
    });
  });
});

describe("checkLineup", () => {
  it("lets a sub play", () => {
    expect(checkLineup(TEAM, [1, 4, 3], RULES)).toEqual({ ok: true, value: [1, 4, 3] });
  });

  it.each([
    ["wrong size", [1, 2]],
    ["repeat", [1, 1, 2]],
    ["outsider", [1, 2, 9]],
  ])("refuses %s", (_, lineup) => {
    expect(checkLineup(TEAM, lineup, RULES).ok).toBe(false);
  });
});

describe("names", () => {
  it("keys names loosely", () => {
    expect(teamNameKey("  Moss   Men ")).toBe("moss men");
  });

  it("numbers taken names and clamps to 32", () => {
    expect(uniqueTeamName("Moss", [])).toBe("Moss");
    expect(uniqueTeamName("moss", ["MOSS"])).toBe("moss 2");
    expect(uniqueTeamName("Moss", ["Moss", "moss 2"])).toBe("Moss 3");
    const long = "x".repeat(40);
    const first = uniqueTeamName(long, []);
    expect(first).toHaveLength(32);
    const second = uniqueTeamName(long, [first]);
    expect(second).toHaveLength(32);
    expect(second.endsWith(" 2")).toBe(true);
  });
});
