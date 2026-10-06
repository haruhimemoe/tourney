/**
 * @file src/team.ts
 * @desc Sides: solo or team rules, the team schema, roster and lineup checks, team name helpers.
 *       A lineup is who plays one map, picked from the roster and subs.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { IdSchema, OsuIdSchema } from "./ids.js";
import { fail, ok, type Result } from "./result.js";

/** How sides are made up: one player, or a team with a roster, subs and a lineup per map. */
export const SideRulesSchema = z.object({
  kind: z.enum(["solo", "team"]),
  /** Players on a map per side. */
  lineup: z.number().int().min(1).max(16),
  rosterMin: z.number().int().min(1).max(32),
  rosterMax: z.number().int().min(1).max(32),
  subsMax: z.number().int().min(0).max(16),
});

/** How sides are made up. */
export type SideRules = z.infer<typeof SideRulesSchema>;

/** Longest team name. */
export const MAX_TEAM_NAME = 32;

/** A team: captain, roster (the core players) and subs. */
export const TeamSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(MAX_TEAM_NAME),
  tag: z.string().trim().min(1).max(8).nullable(),
  captainId: OsuIdSchema,
  roster: z.array(OsuIdSchema).max(32),
  subs: z.array(OsuIdSchema).max(16),
  seed: z.number().int().positive().nullable(),
});

/** A team. */
export type Team = z.infer<typeof TeamSchema>;

/**
 * @function checkSideRules
 * @param rules {SideRules} side rules
 * @returns {Result<SideRules>} the rules, or bad-input when they can't be met (rosterMin above
 *          rosterMax, a lineup bigger than the roster can be, or solo with more than one player)
 */
export const checkSideRules = (rules: SideRules): Result<SideRules> => {
  if (rules.rosterMin > rules.rosterMax) return fail("bad-input", "rosterMin is above rosterMax");
  if (rules.lineup > rules.rosterMax + rules.subsMax) {
    return fail("bad-input", "the lineup is bigger than a full roster with subs");
  }
  if (rules.kind === "solo" && (rules.lineup !== 1 || rules.rosterMax !== 1 || rules.subsMax)) {
    return fail("bad-input", "solo sides are one player with no subs");
  }
  return ok(rules);
};

/**
 * @function checkTeam
 * @param team {Team} a team
 * @param rules {SideRules} the tournament's side rules
 * @returns {Result<Team>} the team, or bad-side naming the first broken rule: captain not on the
 *          roster, a player listed twice, roster or subs outside their limits; bad-input when the
 *          rules themselves fail checkSideRules
 */
export const checkTeam = <T extends Team>(team: T, rules: SideRules): Result<T> => {
  const valid = checkSideRules(rules);
  if (!valid.ok) return valid;
  if (!team.roster.includes(team.captainId)) {
    return fail("bad-side", "the captain is not on the roster");
  }
  const all = [...team.roster, ...team.subs];
  if (new Set(all).size !== all.length) return fail("bad-side", "a player is listed twice");
  if (team.roster.length < rules.rosterMin || team.roster.length > rules.rosterMax) {
    return fail("bad-side", `the roster needs ${rules.rosterMin} to ${rules.rosterMax} players`);
  }
  if (team.subs.length > rules.subsMax) {
    return fail("bad-side", `at most ${rules.subsMax} subs`);
  }
  return ok(team);
};

/**
 * @function checkLineup
 * @param team {Team} the team
 * @param lineup {readonly number[]} osu! ids playing one map
 * @param rules {SideRules} the side rules
 * @returns {Result<number[]>} the lineup, or bad-side when its size is wrong, a player repeats or
 *          someone is on neither the roster nor the subs
 */
export const checkLineup = (
  team: Team,
  lineup: readonly number[],
  rules: SideRules,
): Result<number[]> => {
  if (lineup.length !== rules.lineup) {
    return fail("bad-side", `a lineup is ${rules.lineup} players`);
  }
  if (new Set(lineup).size !== lineup.length) return fail("bad-side", "a player is listed twice");
  const allowed = new Set([...team.roster, ...team.subs]);
  const outsider = lineup.find((id) => !allowed.has(id));
  if (outsider !== undefined) return fail("bad-side", `${outsider} is not on this team`);
  return ok([...lineup]);
};

/**
 * @function teamNameKey
 * @param name {string} a team name
 * @returns {string} the name for comparing: trimmed, inner spaces collapsed, lower case
 */
export const teamNameKey = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * @function uniqueTeamName
 * @param name {string} the wanted name
 * @param taken {Iterable<string>} names already used
 * @returns {string} the name (or "Team" when blank), or with " 2", " 3" and so on, cut to fit
 *          32 characters
 */
export const uniqueTeamName = (name: string, taken: Iterable<string>): string => {
  const used = new Set([...taken].map(teamNameKey));
  const base = name.trim().replace(/\s+/g, " ").slice(0, MAX_TEAM_NAME) || "Team";
  if (!used.has(teamNameKey(base))) return base;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = `${base.slice(0, MAX_TEAM_NAME - suffix.length).trimEnd()}${suffix}`;
    if (!used.has(teamNameKey(candidate))) return candidate;
  }
};
