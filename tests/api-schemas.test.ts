/**
 * @file tests/api-schemas.test.ts
 * @desc The /api entry: a public match drops notes, staff and app fields; write bodies refuse
 *       unknown keys and fill in their defaults; error bodies, pages and the key prefix.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  ApiErrorSchema,
  type ApiFillInput,
  ApiFillInputSchema,
  type ApiMatch,
  ApiMatchPatchSchema,
  ApiMatchSchema,
  type ApiResultInput,
  ApiResultInputSchema,
  ApiTeamSchema,
  apiPageSchema,
} from "../src/api.js";
import type { Match } from "../src/match.js";

const PUBLIC_MATCH: ApiMatch = {
  id: "m1",
  bracketCode: "M1",
  round: "SF",
  a: "t1",
  b: "t2",
  bestOf: 7,
  status: "done",
  scheduledAt: "2026-11-02T20:00:00Z",
  scoreA: 4,
  scoreB: 2,
  winner: "a",
  mpLinks: ["https://osu.ppy.sh/community/matches/111"],
  streamUrl: null,
  vodUrl: "https://youtu.be/x",
  pickBans: [{ side: "a", action: "ban", slot: "b:DT#1" }],
  maps: [],
};

const STORED_MATCH: Match = {
  ...PUBLIC_MATCH,
  refereeIds: [1],
  streamerIds: [2],
  commentatorIds: [3, 4],
  reschedules: [{ from: null, to: "2026-11-02T20:00:00Z", at: "2026-10-30T00:00:00Z", by: 5 }],
  notes: "a sub was late",
};

const RESULT: ApiResultInput = {
  maps: [],
  pickBans: [],
  mpLinks: [],
  streamUrl: null,
  vodUrl: null,
};

describe("ApiMatchSchema", () => {
  it("keeps none of a stored match's notes, reschedules, staff ids or app fields", () => {
    const parsed = ApiMatchSchema.parse({ ...STORED_MATCH, editionId: "e1" });
    for (const key of [
      "notes",
      "reschedules",
      "refereeIds",
      "streamerIds",
      "commentatorIds",
      "editionId",
    ]) {
      expect(parsed).not.toHaveProperty(key);
    }
    expect(parsed).toEqual(PUBLIC_MATCH);
  });
});

describe("write bodies", () => {
  it("takes a result with a score of up to 13 maps a side", () => {
    expect(ApiResultInputSchema.safeParse({ ...RESULT, score: { a: 13, b: 12 } }).success).toBe(
      true,
    );
  });

  it.each([
    ["a notes key", { notes: "x" }],
    ["a score past 13", { score: { a: 14, b: 0 } }],
  ])("refuses a result with %s", (_, change) => {
    expect(ApiResultInputSchema.safeParse({ ...RESULT, ...change }).success).toBe(false);
  });

  it("fills in no warmups and no skipped games", () => {
    const input: ApiFillInput = { mpLink: "https://osu.ppy.sh/mp/1" };
    expect(ApiFillInputSchema.parse(input)).toEqual({
      mpLink: "https://osu.ppy.sh/mp/1",
      warmups: 0,
      skip: [],
    });
  });

  it.each([
    ["a cleared time", { scheduledAt: null }],
    ["a staff change", { staff: { op: "add", kind: "referee", osuId: 2 } }],
  ])("takes a match patch with %s", (_, patch) => {
    expect(ApiMatchPatchSchema.parse(patch)).toEqual(patch);
  });

  it.each([
    ["an unknown staff op", { staff: { op: "swap", kind: "referee", osuId: 2 } }],
    ["an unknown key", { when: 1 }],
  ])("refuses a match patch with %s", (_, patch) => {
    expect(ApiMatchPatchSchema.safeParse(patch).success).toBe(false);
  });
});

describe("answers", () => {
  it("takes an error body, with or without field errors and issues", () => {
    expect(ApiErrorSchema.safeParse({ error: { code: "not_found", message: "x" } }).success).toBe(
      true,
    );
    const detailed = {
      error: {
        code: "bad_request",
        message: "Check the form.",
        errors: { name: "Too long." },
        reasons: ["closed"],
      },
      issues: [{ path: ["team", "members", 0], message: "Expected a number" }],
    };
    expect(ApiErrorSchema.parse(detailed)).toEqual(detailed);
    expect(ApiErrorSchema.safeParse({ error: { code: "not_found" } }).success).toBe(false);
  });

  it("pages items with a string cursor or null", () => {
    const TeamsPage = apiPageSchema(ApiTeamSchema);
    const team = {
      id: "t1",
      name: "Moss",
      tag: null,
      captainId: 1,
      roster: [1, 2],
      subs: [3],
      seed: 1,
      status: "active",
      usernames: { "1": "moss", "3": "fern" },
    };
    expect(TeamsPage.safeParse({ items: [], next: null }).success).toBe(true);
    expect(TeamsPage.parse({ items: [team], next: "t1" })).toEqual({ items: [team], next: "t1" });
    expect(TeamsPage.safeParse({ items: [], next: 5 }).success).toBe(false);
  });

  it("names keys with a short h prefix", () => {
    expect(API_KEY_PREFIX).toMatch(/^h[a-z]{2}_$/);
  });
});
