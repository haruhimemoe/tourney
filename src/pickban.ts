/**
 * @file src/pickban.ts
 * @desc Pick/ban: rules, and checkPickBans, which replays a log against a pool and the rules and
 *       returns the state (protected, banned, picked, what is left, whose turn it is). Slots are
 *       @haruhimemoe/pool slotKeys.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { type SlotBucket, slotKey } from "@haruhimemoe/pool";
import { z } from "zod";
import { otherSide, type Side } from "./ids.js";
import { MAX_BEST_OF } from "./ladder.js";
import { type PickBanEntry, winsNeeded } from "./match.js";
import { fail, ok, type Result } from "./result.js";

/** Pick/ban rules: protects and bans per side, and the tiebreaker slot (a slotKey) if any. */
export const PickBanRulesSchema = z.object({
  protects: z.number().int().min(0).max(8),
  bans: z.number().int().min(0).max(8),
  tiebreaker: z.string().min(1).max(32).nullable(),
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

/** The state after a log. `next` is whose turn and what, or null when nothing is left to do. */
export type PickBanState = {
  protected: Record<Side, string[]>;
  banned: Record<Side, string[]>;
  picked: { slot: string; side: Side }[];
  tiebreaker: boolean;
  remaining: string[];
  next: { side: Side | null; action: PickBanEntry["action"] } | null;
};

const isBestOf = (n: number): boolean =>
  Number.isInteger(n) && n >= 1 && n <= MAX_BEST_OF && n % 2 === 1;

const turn = (first: Side, count: number): Side => (count % 2 === 0 ? first : otherSide(first));

/**
 * @function checkPickBans
 * @param log {readonly PickBanEntry[]} entries in order
 * @param ctx {PickBanContext} pool, rules, best-of, first turns and optionally the score
 * @returns {Result<PickBanState>} the state, or the first broken rule: bad-input (rules, best-of
 *          or first turns invalid), bad-slot (not in the pool, or not available), bad-side,
 *          out-of-order (wrong side, or out of phase: all protects, then all bans, then picks),
 *          limit (too many protects, bans or picks) or bad-state (tiebreaker misuse, or anything
 *          after the tiebreaker, or more picks than maps played once a side has won)
 */
export const checkPickBans = (
  log: readonly PickBanEntry[],
  ctx: PickBanContext,
): Result<PickBanState> => {
  const { rules, bestOf, first } = ctx;
  const sides = [first.ban, first.pick, first.protect ?? first.ban];
  if (!PickBanRulesSchema.safeParse(rules).success) return fail("bad-input", "invalid rules");
  if (!isBestOf(bestOf)) return fail("bad-input", "best-of must be an odd number from 1 to 25");
  if (!sides.every((s) => s === "a" || s === "b"))
    return fail("bad-input", "first turns are a or b");
  const keys = new Set(ctx.pool.slots.map(slotKey));
  const tb = rules.tiebreaker;
  if (tb !== null && !keys.has(tb)) return fail("bad-slot", `tiebreaker ${tb} is not in the pool`);
  const firstProtect = first.protect ?? first.ban;
  const state: PickBanState = {
    protected: { a: [], b: [] },
    banned: { a: [], b: [] },
    picked: [],
    tiebreaker: false,
    remaining: [],
    next: null,
  };
  const banned = () => [...state.banned.a, ...state.banned.b];
  const picked = () => state.picked.map((p) => p.slot);
  const need = winsNeeded(bestOf);
  const tied = !ctx.score || (ctx.score.a === need - 1 && ctx.score.b === need - 1);
  const won = !!ctx.score && (ctx.score.a >= need || ctx.score.b >= need);
  const protectsLeft = () =>
    state.protected.a.length + state.protected.b.length < rules.protects * 2;
  const bansLeft = () => banned().length < rules.bans * 2;

  for (const [i, entry] of log.entries()) {
    const at = `entry ${i + 1}`;
    if (state.tiebreaker) return fail("bad-state", `${at}: nothing comes after the tiebreaker`);
    if (!keys.has(entry.slot)) return fail("bad-slot", `${at}: ${entry.slot} is not in the pool`);
    if (entry.action === "tiebreaker") {
      if (entry.side !== null) return fail("bad-side", `${at}: the tiebreaker has no side`);
      if (entry.slot !== tb) return fail("bad-state", `${at}: ${entry.slot} is not the tiebreaker`);
      if (state.picked.length !== bestOf - 1 || !tied) {
        return fail("bad-state", `${at}: the tiebreaker is only played at a tie`);
      }
      state.tiebreaker = true;
      continue;
    }
    const side = entry.side;
    if (side !== "a" && side !== "b") return fail("bad-side", `${at}: needs a side`);
    if (entry.slot === tb)
      return fail("bad-slot", `${at}: the tiebreaker can't be ${entry.action}ed`);
    if (entry.action === "protect") {
      if (banned().length || state.picked.length) {
        return fail("out-of-order", `${at}: protects come first`);
      }
      const count = state.protected.a.length + state.protected.b.length;
      if (side !== turn(firstProtect, count))
        return fail("out-of-order", `${at}: not ${side}'s protect`);
      if (state.protected[side].length >= rules.protects)
        return fail("limit", `${at}: too many protects`);
      if ([...state.protected.a, ...state.protected.b].includes(entry.slot)) {
        return fail("bad-slot", `${at}: ${entry.slot} is already protected`);
      }
      state.protected[side].push(entry.slot);
    } else if (entry.action === "ban") {
      if (protectsLeft()) return fail("out-of-order", `${at}: protects come before bans`);
      if (side !== turn(first.ban, banned().length))
        return fail("out-of-order", `${at}: not ${side}'s ban`);
      if (state.banned[side].length >= rules.bans) return fail("limit", `${at}: too many bans`);
      const blocked = [...state.protected.a, ...state.protected.b, ...banned(), ...picked()];
      if (blocked.includes(entry.slot))
        return fail("bad-slot", `${at}: ${entry.slot} can't be banned`);
      state.banned[side].push(entry.slot);
    } else {
      if (protectsLeft() || bansLeft()) return fail("out-of-order", `${at}: picks come after bans`);
      const played = ctx.score ? ctx.score.a + ctx.score.b : 0;
      if (won && state.picked.length >= played) {
        return fail("bad-state", `${at}: the match was already won`);
      }
      if (side !== turn(first.pick, state.picked.length))
        return fail("out-of-order", `${at}: not ${side}'s pick`);
      if (state.picked.length >= bestOf - 1) return fail("limit", `${at}: too many picks`);
      if ([...banned(), ...picked()].includes(entry.slot)) {
        return fail("bad-slot", `${at}: ${entry.slot} can't be picked`);
      }
      state.picked.push({ slot: entry.slot, side });
    }
  }

  const used = new Set([...banned(), ...picked(), ...(tb ? [tb] : [])]);
  state.remaining = [...keys].filter((key) => !used.has(key));
  state.next = nextTurn(state, ctx, firstProtect, tied);
  return ok(state);
};

const nextTurn = (
  state: PickBanState,
  ctx: PickBanContext,
  firstProtect: Side,
  tied: boolean,
): PickBanState["next"] => {
  const { rules, bestOf, first, score } = ctx;
  const need = winsNeeded(bestOf);
  if (state.tiebreaker || (score && (score.a >= need || score.b >= need))) return null;
  const protects = state.protected.a.length + state.protected.b.length;
  if (
    protects < rules.protects * 2 &&
    !state.picked.length &&
    !state.banned.a.length &&
    !state.banned.b.length
  ) {
    return { side: turn(firstProtect, protects), action: "protect" };
  }
  const bans = state.banned.a.length + state.banned.b.length;
  if (bans < rules.bans * 2) return { side: turn(first.ban, bans), action: "ban" };
  if (state.picked.length < bestOf - 1) {
    return { side: turn(first.pick, state.picked.length), action: "pick" };
  }
  return rules.tiebreaker && tied ? { side: null, action: "tiebreaker" } : null;
};
