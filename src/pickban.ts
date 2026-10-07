/**
 * @file src/pickban.ts
 * @desc Pick/ban: rules, and checkPickBans, which replays a log against a pool, the rules and
 *       their phase order and returns the state (protected, banned, picked, what is left, whose
 *       turn it is). Slots are @haruhimemoe/pool slotKeys.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { type SlotBucket, slotKey } from "@haruhimemoe/pool";
import { z } from "zod";
import { otherSide, type Side } from "./ids.js";
import { MAX_BEST_OF } from "./ladder.js";
import { type PickBanEntry, winsNeeded } from "./match.js";
import { expandPhases, type Phase, PickBanPhaseSchema, phaseStart } from "./pickban-phases.js";
import { fail, ok, type Result } from "./result.js";

/**
 * Pick/ban rules: protects and bans per side, the tiebreaker slot (a slotKey) if any, and
 * optionally the phase order. With `phases`, `protects` and `bans` are ignored; without, the
 * order is every protect, then every ban, then picks.
 */
export const PickBanRulesSchema = z.object({
  protects: z.number().int().min(0).max(8),
  bans: z.number().int().min(0).max(8),
  tiebreaker: z.string().min(1).max(32).nullable(),
  phases: z.array(PickBanPhaseSchema).max(16).optional(),
});

/** Pick/ban rules. */
export type PickBanRules = z.infer<typeof PickBanRulesSchema>;

/** Who starts each action, as the roll decided. `protect` defaults to `ban`. */
export type FirstTurns = { protect?: Side; ban: Side; pick: Side };

/** What checkPickBans takes besides the log. */
export type PickBanContext = {
  pool: { slots: readonly { mod: SlotBucket; index: number }[] };
  rules: PickBanRules;
  bestOf: number;
  first: FirstTurns;
  /** Maps won so far. When given, the tiebreaker needs a tie and `next` stops once a side won. */
  score?: { a: number; b: number };
};

/**
 * The state after a log. `next` is whose turn and what, or null when nothing is left to do.
 * `phase` is the current phase's index in pickBanPhases(rules), null once nothing is left.
 */
export type PickBanState = {
  protected: Record<Side, string[]>;
  banned: Record<Side, string[]>;
  picked: { slot: string; side: Side }[];
  tiebreaker: boolean;
  remaining: string[];
  next: { side: Side | null; action: PickBanEntry["action"] } | null;
  phase: number | null;
};

const isBestOf = (n: number): boolean =>
  Number.isInteger(n) && n >= 1 && n <= MAX_BEST_OF && n % 2 === 1;

const turn = (first: Side, count: number): Side => (count % 2 === 0 ? first : otherSide(first));

/**
 * @function checkPickBans
 * @param log {readonly PickBanEntry[]} entries in order
 * @param ctx {PickBanContext} pool, rules, best-of, first turns and optionally the score
 * @returns {Result<PickBanState>} the state, or the first broken rule: bad-input (rules, phases,
 *          best-of or first turns invalid), bad-slot (not in the pool, or not available),
 *          bad-side, out-of-order (wrong side, or an action its phase doesn't allow yet),
 *          limit (an action with no phase left, or too many picks) or bad-state (tiebreaker
 *          misuse, anything after the tiebreaker, or more picks than maps played once a side
 *          has won)
 */
export const checkPickBans = (
  log: readonly PickBanEntry[],
  ctx: PickBanContext,
): Result<PickBanState> => {
  const { rules, bestOf } = ctx;
  if (!PickBanRulesSchema.safeParse(rules).success) return fail("bad-input", "invalid rules");
  const expanded = expandPhases(rules);
  if (!expanded.ok) return expanded;
  const phases = expanded.value;
  if (!isBestOf(bestOf)) return fail("bad-input", "best-of must be an odd number from 1 to 25");
  const first = { ...ctx.first, protect: ctx.first.protect ?? ctx.first.ban };
  if (![first.ban, first.pick, first.protect].every((s) => s === "a" || s === "b")) {
    return fail("bad-input", "first turns are a or b");
  }
  const keys = new Set(ctx.pool.slots.map(slotKey));
  const tb = rules.tiebreaker;
  if (tb !== null && !keys.has(tb)) return fail("bad-slot", `tiebreaker ${tb} is not in the pool`);
  const state: PickBanState = {
    protected: { a: [], b: [] },
    banned: { a: [], b: [] },
    picked: [],
    tiebreaker: false,
    remaining: [],
    next: null,
    phase: null,
  };
  const all = (r: Record<Side, string[]>) => [...r.a, ...r.b];
  const picked = () => state.picked.map((p) => p.slot);
  const need = winsNeeded(bestOf);
  const tied = !ctx.score || (ctx.score.a === need - 1 && ctx.score.b === need - 1);
  const won = !!ctx.score && (ctx.score.a >= need || ctx.score.b >= need);
  // Entries made in each phase; `at` is the current phase once full phases are skipped.
  const made = phases.map(() => 0);
  let at = 0;
  const settle = () => {
    for (let p = phases[at] as Phase; p.count !== null && (made[at] as number) >= p.count; ) {
      p = phases[++at] as Phase;
    }
  };

  for (const [i, entry] of log.entries()) {
    const where = `entry ${i + 1}`;
    if (state.tiebreaker) return fail("bad-state", `${where}: nothing comes after the tiebreaker`);
    if (!keys.has(entry.slot))
      return fail("bad-slot", `${where}: ${entry.slot} is not in the pool`);
    if (entry.action === "tiebreaker") {
      if (entry.side !== null) return fail("bad-side", `${where}: the tiebreaker has no side`);
      if (entry.slot !== tb)
        return fail("bad-state", `${where}: ${entry.slot} is not the tiebreaker`);
      if (state.picked.length !== bestOf - 1 || !tied) {
        return fail("bad-state", `${where}: the tiebreaker is only played at a tie`);
      }
      state.tiebreaker = true;
      continue;
    }
    const side = entry.side;
    if (side !== "a" && side !== "b") return fail("bad-side", `${where}: needs a side`);
    if (entry.slot === tb) {
      return fail("bad-slot", `${where}: the tiebreaker can't be ${entry.action}ed`);
    }
    settle();
    const phase = phases[at] as Phase;
    // Picks used up while a later phase is still pending: over the limit, not out of order.
    if (entry.action === "pick" && state.picked.length > 0 && state.picked.length >= bestOf - 1) {
      return fail("limit", `${where}: too many picks`);
    }
    if (phase.action !== entry.action) {
      return misplaced(phases, made, at, entry.action, side, first, where);
    }
    if (entry.action === "pick") {
      const played = ctx.score ? ctx.score.a + ctx.score.b : 0;
      if (won && state.picked.length >= played) {
        return fail("bad-state", `${where}: the match was already won`);
      }
    }
    if (side !== turn(phaseStart(phase, first), made[at] as number)) {
      return fail("out-of-order", `${where}: not ${side}'s ${entry.action}`);
    }
    const taken = [...all(state.banned), ...picked()];
    if (entry.action === "protect") {
      if ([...all(state.protected), ...taken].includes(entry.slot)) {
        return fail("bad-slot", `${where}: ${entry.slot} can't be protected`);
      }
      state.protected[side].push(entry.slot);
    } else if (entry.action === "ban") {
      if ([...all(state.protected), ...taken].includes(entry.slot)) {
        return fail("bad-slot", `${where}: ${entry.slot} can't be banned`);
      }
      state.banned[side].push(entry.slot);
    } else {
      if (state.picked.length >= bestOf - 1) return fail("limit", `${where}: too many picks`);
      if (taken.includes(entry.slot))
        return fail("bad-slot", `${where}: ${entry.slot} can't be picked`);
      state.picked.push({ slot: entry.slot, side });
    }
    made[at] = (made[at] as number) + 1;
  }

  settle();
  const used = new Set([...all(state.banned), ...picked(), ...(tb ? [tb] : [])]);
  state.remaining = [...keys].filter((key) => !used.has(key));
  const done = state.tiebreaker || (!!ctx.score && won);
  const phase = phases[at] as Phase;
  // Once picks have run out, phases still pending don't matter: only the tiebreaker is left.
  const picksLeft = state.picked.length < bestOf - 1;
  if (!done && (picksLeft || (state.picked.length === 0 && phase.action !== "pick"))) {
    state.next = { side: turn(phaseStart(phase, first), made[at] as number), action: phase.action };
    state.phase = phases.slice(0, at).filter((p) => p.count !== 0).length;
  } else if (!done && tb && tied) {
    state.next = { side: null, action: "tiebreaker" };
  }
  return ok(state);
};

/**
 * Why an action its phase doesn't allow is refused. Out of order while a later phase has it, and
 * a protect is out of order once anything was logged after its last phase (protects come first).
 * Otherwise the turn is checked as if that phase ran on, and a right turn is over the limit.
 */
const misplaced = (
  phases: readonly Phase[],
  made: readonly number[],
  at: number,
  action: Phase["action"],
  side: Side,
  first: { protect: Side; ban: Side; pick: Side },
  where: string,
): Result<PickBanState> => {
  if (phases.slice(at + 1).some((p) => p.action === action)) {
    return fail("out-of-order", `${where}: not time to ${action}`);
  }
  const last = phases.slice(0, at).findLastIndex((p) => p.action === action);
  const since = made.slice(last + 1, at + 1).reduce((sum, n) => sum + n, 0);
  if (action === "protect" && since > 0)
    return fail("out-of-order", `${where}: protects come first`);
  const phase = phases[last];
  const start = phase ? phaseStart(phase, first) : first[action];
  if (side !== turn(start, phase ? (made[last] as number) : 0)) {
    return fail("out-of-order", `${where}: not ${side}'s ${action}`);
  }
  return fail("limit", `${where}: too many ${action}s`);
};
