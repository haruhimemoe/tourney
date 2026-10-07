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
import * as mp from "../src/mp.js";

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
  "DEFAULT_STANDINGS_RULES",
  "GroupSchema",
  "MAX_GROUP",
  "MAX_PHASES",
  "PickBanPhaseSchema",
  "StandingsRulesSchema",
  "TIEBREAKS",
  "groupStandings",
  "pickBanPhases",
  "placements",
  "rollFirst",
  "roundRobin",
  "seedsFromGroups",
  "snakeGroups",
  "swissPairings",
  "swissRounds",
];

const MP_API = ["fromOsuMatch"];

describe("exports", () => {
  it("exports exactly its API", () => {
    expect(Object.keys(root).sort()).toEqual([...API].sort());
    expect(Object.keys(mp).sort()).toEqual(MP_API);
  });

  it("keeps osu out of the root entry", () => {
    const reach = (file: string, seen = new Set<string>()): Set<string> => {
      seen.add(file);
      for (const [, spec] of readFileSync(file, "utf8").matchAll(
        /^import (?!type)[^;]* from "([^"]+)";/gm,
      )) {
        if (spec?.startsWith("./")) {
          const next = join("src", spec.replace(/\.js$/, ".ts"));
          if (!seen.has(next)) reach(next, seen);
        } else if (spec) seen.add(spec);
      }
      return seen;
    };
    const used = reach("src/index.ts");
    expect([...used].filter((x) => x.startsWith("@haruhimemoe/osu"))).toEqual([]);
    expect(used.has("src/mp.ts")).toBe(false);
  });

  it("maps one entry point and has peers only", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(Object.keys(pkg.exports)).toEqual([".", "./mp", "./package.json"]);
    expect(pkg.peerDependenciesMeta).toEqual({ "@haruhimemoe/osu": { optional: true } });
    expect(pkg.dependencies).toBeUndefined();
    expect(Object.keys(pkg.peerDependencies).sort()).toEqual([
      "@haruhimemoe/osu",
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
