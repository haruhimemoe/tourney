/**
 * @file src/tournament.ts
 * @desc The tournament (one edition): mode, side rules, phase and the registration window.
 *       Phases only move forward and may be skipped.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { IdSchema, InstantSchema } from "./ids.js";
import { fail, ok, type Result } from "./result.js";
import { SideRulesSchema } from "./team.js";

/** Phases in order. `done` is final. */
export const TOURNAMENT_PHASES = [
  "setup",
  "registration",
  "qualifiers",
  "draft",
  "bracket",
  "done",
] as const;

/** A tournament phase. */
export const PhaseSchema = z.enum(TOURNAMENT_PHASES);

/** A tournament phase. */
export type Phase = z.infer<typeof PhaseSchema>;

/** osu! game modes, as osu! names them. */
export const MODES = ["osu", "taiko", "fruits", "mania"] as const;

/** When registration runs and how many it takes. Null means no bound. */
export const RegistrationWindowSchema = z.object({
  opensAt: InstantSchema.nullable(),
  closesAt: InstantSchema.nullable(),
  playerCap: z.number().int().positive().nullable(),
  staffCap: z.number().int().positive().nullable(),
});

/** One tournament edition. */
export const TournamentSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(128),
  /** Short code, e.g. EGC2026. */
  code: z.string().trim().min(1).max(16),
  mode: z.enum(MODES),
  phase: PhaseSchema,
  sides: SideRulesSchema,
  registration: RegistrationWindowSchema,
});

/** One tournament edition. */
export type Tournament = z.infer<typeof TournamentSchema>;

/**
 * @function isRegistrationOpen
 * @param tournament {Tournament} the tournament
 * @param now {Date} the current time
 * @returns {boolean} true in the registration phase with now in [opensAt, closesAt)
 */
export const isRegistrationOpen = (tournament: Tournament, now: Date): boolean => {
  if (tournament.phase !== "registration") return false;
  const t = now.getTime();
  if (Number.isNaN(t)) return false;
  const { opensAt, closesAt } = tournament.registration;
  if (opensAt !== null && t < Date.parse(opensAt)) return false;
  if (closesAt !== null && t >= Date.parse(closesAt)) return false;
  return true;
};

/**
 * @function advancePhase
 * @param tournament {T} the tournament
 * @param to {Phase} the next phase
 * @returns {Result<T>} a copy in the new phase, or bad-state when it would go back or stay
 */
export const advancePhase = <T extends Tournament>(tournament: T, to: Phase): Result<T> => {
  const from = TOURNAMENT_PHASES.indexOf(tournament.phase);
  if (TOURNAMENT_PHASES.indexOf(to) <= from) {
    return fail("bad-state", `can't go from ${tournament.phase} to ${to}`);
  }
  return ok({ ...tournament, phase: to });
};
