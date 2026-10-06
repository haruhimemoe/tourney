/**
 * @file src/registration.ts
 * @desc Player and staff registrations: schema, review transitions, role conflicts and whether
 *       someone may register now.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { availabilitySchema } from "@haruhimemoe/time/availability";
import { z } from "zod";
import { IdSchema, InstantSchema, OsuIdSchema } from "./ids.js";
import { fail, ok, type Result } from "./result.js";
import { isRegistrationOpen, type Tournament } from "./tournament.js";

/** Registration statuses. */
export const REGISTRATION_STATUSES = [
  "pending",
  "approved",
  "waitlisted",
  "rejected",
  "withdrawn",
] as const;

/** Registration status. */
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/** Common staff roles. Apps may use others; roles are plain strings. */
export const STAFF_ROLES = [
  "host",
  "admin",
  "referee",
  "streamer",
  "commentator",
  "mappooler",
  "mapper",
  "playtester",
  "designer",
  "developer",
] as const;

/** One registration. Approved roles may differ from the roles applied for. */
export const RegistrationSchema = z.object({
  id: IdSchema,
  osuId: OsuIdSchema,
  kind: z.enum(["player", "staff"]),
  status: z.enum(REGISTRATION_STATUSES),
  appliedRoles: z.array(z.string().min(1).max(32)).max(16),
  approvedRoles: z.array(z.string().min(1).max(32)).max(16),
  availability: availabilitySchema.nullable(),
  createdAt: InstantSchema,
});

/** One registration. */
export type Registration = z.infer<typeof RegistrationSchema>;

const MOVES: Record<RegistrationStatus, readonly RegistrationStatus[]> = {
  pending: ["approved", "waitlisted", "rejected", "withdrawn"],
  waitlisted: ["approved", "rejected", "withdrawn"],
  approved: ["withdrawn"],
  rejected: [],
  withdrawn: [],
};

/**
 * @function reviewRegistration
 * @param registration {T} a registration
 * @param to {RegistrationStatus} the new status
 * @returns {Result<T>} a copy in the new status (approving staff with no approved roles copies
 *          the applied ones), or bad-state for a move the table doesn't allow
 */
export const reviewRegistration = <T extends Registration>(
  registration: T,
  to: RegistrationStatus,
): Result<T> => {
  if (!MOVES[registration.status].includes(to)) {
    return fail("bad-state", `can't go from ${registration.status} to ${to}`);
  }
  const copyRoles =
    to === "approved" && registration.kind === "staff" && !registration.approvedRoles.length;
  return ok({
    ...registration,
    status: to,
    ...(copyRoles ? { approvedRoles: [...registration.appliedRoles] } : {}),
  });
};

/** Pairs of roles one person can't hold in the same tournament. "player" means playing. */
export const DEFAULT_ROLE_CONFLICTS: readonly (readonly [string, string])[] = [
  ["player", "mappooler"],
  ["player", "playtester"],
];

/**
 * @function checkRoleConflicts
 * @param registrations {readonly Registration[]} one person's live registrations
 * @param conflicts {readonly (readonly [string, string])[]} pairs that clash
 * @returns {[string, string][]} the clashing pairs held; withdrawn and rejected ones don't count,
 *          staff count by approved roles (applied while undecided)
 */
export const checkRoleConflicts = (
  registrations: readonly Registration[],
  conflicts: readonly (readonly [string, string])[] = DEFAULT_ROLE_CONFLICTS,
): [string, string][] => {
  const held = new Set<string>();
  for (const r of registrations) {
    if (r.status === "withdrawn" || r.status === "rejected") continue;
    if (r.kind === "player") held.add("player");
    else
      for (const role of r.status === "approved" ? r.approvedRoles : r.appliedRoles) held.add(role);
  }
  return conflicts.filter(([x, y]) => held.has(x) && held.has(y)).map(([x, y]) => [x, y]);
};

/**
 * @function canRegister
 * @param tournament {Tournament} the tournament
 * @param kind {"player" | "staff"} what kind of registration
 * @param counts {{ players: number; staff: number }} live registrations so far (not withdrawn or
 *        rejected)
 * @param now {Date} the current time
 * @returns {Result<true>} ok, or closed (outside the window) or limit (the cap is reached)
 */
export const canRegister = (
  tournament: Tournament,
  kind: "player" | "staff",
  counts: { players: number; staff: number },
  now: Date,
): Result<true> => {
  if (!isRegistrationOpen(tournament, now)) return fail("closed", "registration is closed");
  const cap =
    kind === "player" ? tournament.registration.playerCap : tournament.registration.staffCap;
  const count = kind === "player" ? counts.players : counts.staff;
  if (cap !== null && count >= cap) return fail("limit", `${kind} registration is full`);
  return ok(true);
};
