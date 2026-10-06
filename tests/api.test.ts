/**
 * @file tests/api.test.ts
 * @desc The public surface (an added or removed export is a visible semver question), the
 *       exports map, peers only, and that src/ stays browser-safe, headed and small.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as root from "../src/index.js";

const API = [
  "BRACKET_STATUSES",
  "BracketMatchSchema",
  "BracketSchema",
  "BracketSideSchema",
  "DEFAULT_ROLE_CONFLICTS",
  "DraftPickSchema",
  "DraftSchema",
  "FormatSchema",
  "IdSchema",
  "InstantSchema",
  "MATCH_STATUSES",
  "MAX_BEST_OF",
  "MAX_ENTRANTS",
  "MAX_TEAM_NAME",
  "MODES",
  "MapResultSchema",
  "MatchSchema",
  "OsuIdSchema",
  "PhaseSchema",
  "PickBanEntrySchema",
  "PickBanRulesSchema",
  "PlayerScoreSchema",
  "REGISTRATION_STATUSES",
  "RegistrationSchema",
  "RegistrationWindowSchema",
  "RescheduleRulesSchema",
  "RescheduleSchema",
  "RoundSchema",
  "STAFF_ROLES",
  "SideRulesSchema",
  "SideSchema",
  "SourceSchema",
  "TOURNAMENT_PHASES",
  "TeamSchema",
  "TournamentSchema",
  "advancePhase",
  "bracketSize",
  "buildLadder",
  "canRegister",
  "champion",
  "checkLineup",
  "checkPickBans",
  "checkReschedule",
  "checkRoleConflicts",
  "checkScore",
  "checkSideRules",
  "checkTeam",
  "clearResult",
  "createBracket",
  "draftOrder",
  "dropOrder",
  "hasResult",
  "isDecided",
  "isRegistrationOpen",
  "makePick",
  "matchesFor",
  "nextMatch",
  "onTheClock",
  "otherSide",
  "pickDeadline",
  "rankQualifiers",
  "reportForfeit",
  "reportResult",
  "reviewRegistration",
  "scoreFromMaps",
  "seedPositions",
  "settleBracket",
  "suggestMatchTimes",
  "teamNameKey",
  "teamTotals",
  "uniqueTeamName",
  "winnerOf",
  "winnersCode",
  "winsNeeded",
  "wireBracket",
];

describe("exports", () => {
  it("exports exactly its API", () => {
    expect(Object.keys(root).sort()).toEqual([...API].sort());
  });

  it("maps one entry point and has peers only", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(Object.keys(pkg.exports)).toEqual([".", "./package.json"]);
    expect(pkg.dependencies).toBeUndefined();
    expect(Object.keys(pkg.peerDependencies).sort()).toEqual([
      "@haruhimemoe/pool",
      "@haruhimemoe/time",
      "zod",
    ]);
  });
});

describe("src", () => {
  const files = readdirSync("src").map((name) => join("src", name));

  it.each(files)("%s is browser-safe, headed and under 250 lines", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(
      /from "node:|require\(|process\.|Buffer\b|Math\.random|Date\.now|new Date\(\)/,
    );
    expect(source.startsWith(`/**\n * @file ${file}\n`)).toBe(true);
    expect(source.split("\n").length).toBeLessThan(250);
    expect(source.includes(String.fromCharCode(0x2014))).toBe(false); // no em dashes
  });
});
