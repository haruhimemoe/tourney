/**
 * @file src/schedule.ts
 * @desc Scheduling: suggested match times from both sides' availability (through
 *       @haruhimemoe/time, the higher seed's side breaking ties) and reschedule rules.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { findSlots, type Member, type SlotCandidate } from "@haruhimemoe/time/slots";
import { z } from "zod";
import type { Match } from "./match.js";
import { fail, ok, type Result } from "./result.js";

/** One side for scheduling: entrant id, its seed (1 is best) and its players' availability. */
export type ScheduleSide = {
  id: string;
  seed: number | null;
  members: readonly Member[];
  need?: number;
};

/** What suggestMatchTimes takes. */
export type SuggestOptions = {
  a: ScheduleSide;
  b: ScheduleSide;
  /** The round's window: starts in [start, end), every match ends by end. */
  window: { start: Date; end: Date };
  lengthMinutes: number;
  staff?: readonly Member[];
  staffNeed?: number;
  limit?: number;
};

/**
 * @function suggestMatchTimes
 * @param opts {SuggestOptions} both sides, the window, match length and optional staff
 * @returns {Result<SlotCandidate[]>} the best starts, best first: both sides ready, more players
 *          free, and on a tie more of the higher seed's players free; bad-input when
 *          @haruhimemoe/time refuses the query
 */
export const suggestMatchTimes = (opts: SuggestOptions): Result<SlotCandidate[]> => {
  const rank = (side: ScheduleSide) => side.seed ?? Number.POSITIVE_INFINITY;
  const higher = rank(opts.a) <= rank(opts.b) ? opts.a.id : opts.b.id;
  const free = (c: SlotCandidate) => c.sides.find((s) => s.id === higher)?.free.length ?? 0;
  const side = ({ id, members, need }: ScheduleSide) => ({
    id,
    members,
    ...(need === undefined ? {} : { need }),
  });
  try {
    return ok(
      findSlots({
        sides: [side(opts.a), side(opts.b)],
        window: opts.window,
        lengthMinutes: opts.lengthMinutes,
        ...(opts.staff ? { staff: opts.staff } : {}),
        ...(opts.staffNeed === undefined ? {} : { staffNeed: opts.staffNeed }),
        ...(opts.limit === undefined ? {} : { limit: opts.limit }),
        tiebreak: (x, y) => free(y) - free(x),
      }),
    );
  } catch (error) {
    return fail("bad-input", error instanceof Error ? error.message : String(error));
  }
};

/** Reschedule rules for a round. */
export const RescheduleRulesSchema = z.object({
  /** New times must fall in [start, end). */
  window: z.object({ start: z.date(), end: z.date() }),
  maxReschedules: z.number().int().min(0).max(1000),
  /** Hours before both the old and the new time that a request must come in. */
  minNoticeHours: z
    .number()
    .min(0)
    .max(24 * 365),
});

/** Reschedule rules. */
export type RescheduleRules = z.infer<typeof RescheduleRulesSchema>;

/**
 * @function checkReschedule
 * @param match {Pick<Match, "status" | "scheduledAt" | "reschedules">} the match
 * @param to {Date} the proposed time
 * @param rules {RescheduleRules} the round's rules
 * @param now {Date} the current time
 * @returns {Result<Date>} the time, or bad-input (rules fail RescheduleRulesSchema), bad-state (match not scheduled), bad-input (bad date or
 *          outside the window), closed (too close to the old or new time) or limit (too many; an entry
 *          with no `from`, the first scheduling, doesn't count)
 */
export const checkReschedule = (
  match: Pick<Match, "status" | "scheduledAt" | "reschedules">,
  to: Date,
  rules: RescheduleRules,
  now: Date,
): Result<Date> => {
  if (!RescheduleRulesSchema.safeParse(rules).success) return fail("bad-input", "invalid rules");
  if (match.status !== "scheduled") return fail("bad-state", `the match is ${match.status}`);
  const t = to.getTime();
  if (Number.isNaN(t) || Number.isNaN(now.getTime())) return fail("bad-input", "invalid date");
  if (t < rules.window.start.getTime() || t >= rules.window.end.getTime()) {
    return fail("bad-input", "the new time is outside the round's window");
  }
  const notice = rules.minNoticeHours * 3_600_000;
  const old = match.scheduledAt === null ? null : Date.parse(match.scheduledAt);
  if (t - now.getTime() < notice || (old !== null && old - now.getTime() < notice)) {
    return fail("closed", `requests need ${rules.minNoticeHours} hours' notice`);
  }
  if (match.reschedules.filter((r) => r.from !== null).length >= rules.maxReschedules) {
    return fail("limit", `at most ${rules.maxReschedules} reschedules`);
  }
  return ok(new Date(t));
};
