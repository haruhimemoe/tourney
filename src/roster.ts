/**
 * @file src/roster.ts
 * @desc Roster rules: until the lock a team's captain changes the roster freely; from the lock on
 *       each change counts against a limit and needs the approver's yes. checkRosterChange says
 *       which applies to a change now.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { z } from "zod";
import { InstantSchema } from "./ids.js";
import { fail, ok, type Result } from "./result.js";

/** Who approves a roster change made after the lock. */
export const ROSTER_APPROVERS = ["captain", "admin"] as const;

/**
 * Roster rules: when rosters lock (null for never), how many changes a team may make from then
 * on, and who approves them.
 */
export const RosterRulesSchema = z.object({
  lockAt: InstantSchema.nullable(),
  maxChanges: z.number().int().min(0).max(16),
  approver: z.enum(ROSTER_APPROVERS),
});

/** Roster rules. */
export type RosterRules = z.infer<typeof RosterRulesSchema>;

/** The defaults: no lock, and once one is set, one change after it, approved by an admin. Frozen. */
export const DEFAULT_ROSTER_RULES: Readonly<RosterRules> = Object.freeze<RosterRules>({
  lockAt: null,
  maxChanges: 1,
  approver: "admin",
});

/** What a roster change needs: whether it counts against the limit, and who approves it. */
export type RosterChangeCheck = { counted: boolean; approval: (typeof ROSTER_APPROVERS)[number] };

/**
 * @function checkRosterChange
 * @param rules {RosterRules} the roster rules
 * @param ctx {{ now: Date; changes: number }} the time, and the counted changes the team has made
 *        since the lock
 * @returns {Result<RosterChangeCheck>} with no lock or before it, an uncounted change the captain
 *          approves; from the lock on, a counted change for `rules.approver`, or limit once
 *          `maxChanges` are used; bad-input for invalid rules, an invalid date or a count that
 *          isn't a whole number from 0
 */
export const checkRosterChange = (
  rules: RosterRules,
  ctx: { now: Date; changes: number },
): Result<RosterChangeCheck> => {
  if (!RosterRulesSchema.safeParse(rules).success) return fail("bad-input", "invalid roster rules");
  const t = ctx.now.getTime();
  if (Number.isNaN(t)) return fail("bad-input", "now is not a valid date");
  if (!Number.isInteger(ctx.changes) || ctx.changes < 0) {
    return fail("bad-input", "changes is a whole number from 0");
  }
  if (rules.lockAt === null || t < Date.parse(rules.lockAt)) {
    return ok({ counted: false, approval: "captain" });
  }
  if (ctx.changes >= rules.maxChanges) {
    return fail("limit", "no roster changes left after the lock");
  }
  return ok({ counted: true, approval: rules.approver });
};
