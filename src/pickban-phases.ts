/**
 * @file src/pickban-phases.ts
 * @desc Pick/ban phase order: an ordered list of protect, ban and pick phases, each with a count
 *       across both sides, so split bans (ban, pick, ban, pick) work. The 0.1 rules (protects and
 *       bans per side) are shorthand for [protect, ban], and an open pick phase always ends it.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { otherSide, type Side } from "./ids.js";
import { fail, ok, type Result } from "./result.js";

/** Most phases in one order. */
export const MAX_PHASES = 16;

/**
 * One phase. `count` is entries across both sides (one ban each is 2); null runs until the
 * picks run out and is only allowed on a last pick phase. Turns alternate from the side the roll
 * gave that action, or from the other side with `swap`.
 */
export const PickBanPhaseSchema = z.object({
  action: z.enum(["protect", "ban", "pick"]),
  count: z.number().int().min(1).max(32).nullable(),
  swap: z.boolean(),
});

/** One phase. */
export type PickBanPhase = z.infer<typeof PickBanPhaseSchema>;

/** The shape of the rules phases are read from. */
type PhaseRules = { protects: number; bans: number; phases?: readonly PickBanPhase[] | undefined };

/** A phase while replaying; shorthand keeps empty phases so 0.1 refusals stay the same. */
export type Phase = { action: PickBanPhase["action"]; count: number | null; swap: boolean };

/**
 * @function expandPhases
 * @param rules {PhaseRules} protects and bans per side, and optionally phases
 * @returns {Result<Phase[]>} the phases with an open pick phase at the end; from the shorthand,
 *          protect and ban phases are kept even when empty. bad-input for a malformed list
 */
export const expandPhases = (rules: PhaseRules): Result<Phase[]> => {
  if (rules.phases === undefined) {
    return ok([
      { action: "protect", count: rules.protects * 2, swap: false },
      { action: "ban", count: rules.bans * 2, swap: false },
      { action: "pick", count: null, swap: false },
    ]);
  }
  const list = z.array(PickBanPhaseSchema).max(MAX_PHASES).safeParse(rules.phases);
  if (!list.success) return fail("bad-input", "invalid phases");
  const phases: Phase[] = list.data.map((phase) => ({ ...phase }));
  for (const [i, phase] of phases.entries()) {
    if (phase.count === null && (i !== phases.length - 1 || phase.action !== "pick")) {
      return fail("bad-input", "only a last pick phase can be open");
    }
  }
  if (phases.at(-1)?.count !== null) phases.push({ action: "pick", count: null, swap: false });
  return ok(phases);
};

/**
 * @function pickBanPhases
 * @param rules {PhaseRules} protects and bans per side, and optionally phases
 * @returns {Result<PickBanPhase[]>} the order of play, ending in an open pick phase, with empty
 *          shorthand phases left out; bad-input for a malformed list
 */
export const pickBanPhases = (rules: PhaseRules): Result<PickBanPhase[]> => {
  const phases = expandPhases(rules);
  if (!phases.ok) return phases;
  return ok(phases.value.filter((phase) => phase.count !== 0));
};

/**
 * @function phaseStart
 * @param phase {Phase} a phase
 * @param first {{ protect: Side; ban: Side; pick: Side }} who the roll gave each action
 * @returns {Side} the side that starts the phase
 */
export const phaseStart = (phase: Phase, first: { protect: Side; ban: Side; pick: Side }): Side =>
  phase.swap ? otherSide(first[phase.action]) : first[phase.action];
