/**
 * @file tests/pickban.test.ts
 * @desc Pick/ban replay: a full Bo7 to the tiebreaker, every refusal, `next` at each step, the
 *       score cut-off, custom buckets.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { slotKey } from "@haruhimemoe/pool";
import { describe, expect, it } from "vitest";
import type { PickBanEntry } from "../src/match.js";
import { checkPickBans, type PickBanContext } from "../src/pickban.js";
import { freeze, unwrap } from "./fixtures.js";

const K = (mod: string | null, index: number) => slotKey({ mod, index });
const SLOTS = [
  ...[1, 2, 3, 4].map((index) => ({ mod: "NM", index, beatmapId: index })),
  ...[1, 2].map((index) => ({ mod: "HD", index, beatmapId: 10 + index })),
  ...[1, 2].map((index) => ({ mod: "HR", index, beatmapId: 20 + index })),
  ...[1, 2].map((index) => ({ mod: "DT", index, beatmapId: 30 + index })),
  { mod: "TB", index: 1, beatmapId: 99 },
];
const CTX: PickBanContext = freeze({
  pool: { slots: SLOTS },
  rules: { protects: 1, bans: 1, tiebreaker: K("TB", 1) },
  bestOf: 7,
  first: { ban: "a", pick: "b" },
});
const p = (side: "a" | "b" | null, action: PickBanEntry["action"], slot: string): PickBanEntry => ({
  side,
  action,
  slot,
});

const FULL: PickBanEntry[] = [
  p("a", "protect", K("NM", 1)),
  p("b", "protect", K("HD", 1)),
  p("a", "ban", K("DT", 1)),
  p("b", "ban", K("HR", 1)),
  p("b", "pick", K("NM", 1)),
  p("a", "pick", K("HD", 1)),
  p("b", "pick", K("NM", 2)),
  p("a", "pick", K("HR", 2)),
  p("b", "pick", K("DT", 2)),
  p("a", "pick", K("NM", 3)),
  p(null, "tiebreaker", K("TB", 1)),
];

describe("checkPickBans", () => {
  it("replays a full Bo7 with protects, bans, picks and the tiebreaker", () => {
    const state = unwrap(checkPickBans(freeze([...FULL]), CTX));
    expect(state.protected).toEqual({ a: [K("NM", 1)], b: [K("HD", 1)] });
    expect(state.banned).toEqual({ a: [K("DT", 1)], b: [K("HR", 1)] });
    expect(state.picked.map((x) => x.side)).toEqual(["b", "a", "b", "a", "b", "a"]);
    expect(state.tiebreaker).toBe(true);
    expect(state.remaining).toEqual([K("NM", 4), K("HD", 2)]);
    expect(state.next).toBeNull();
  });

  it("says whose turn it is at every step", () => {
    const expected = [
      { side: "a", action: "protect" },
      { side: "b", action: "protect" },
      { side: "a", action: "ban" },
      { side: "b", action: "ban" },
      { side: "b", action: "pick" },
      { side: "a", action: "pick" },
      { side: "b", action: "pick" },
      { side: "a", action: "pick" },
      { side: "b", action: "pick" },
      { side: "a", action: "pick" },
      { side: null, action: "tiebreaker" },
      null,
    ];
    for (let n = 0; n <= FULL.length; n++) {
      expect(unwrap(checkPickBans(FULL.slice(0, n), CTX)).next).toEqual(expected[n]);
    }
  });

  it("lets protect order follow its own first turn", () => {
    const ctx = { ...CTX, first: { protect: "b" as const, ban: "a" as const, pick: "a" as const } };
    expect(unwrap(checkPickBans([], ctx)).next).toEqual({ side: "b", action: "protect" });
  });

  it("runs protects, then bans, then picks, and allows picking a protected slot", () => {
    const own = [...FULL.slice(0, 4), p("b", "pick", K("HD", 1))];
    expect(checkPickBans(own, CTX).ok).toBe(true);
    expect(checkPickBans([p("a", "ban", K("NM", 2))], CTX)).toMatchObject({
      error: { code: "out-of-order" },
    });
    expect(checkPickBans([...FULL.slice(0, 3), p("b", "pick", K("NM", 2))], CTX)).toMatchObject({
      error: { code: "out-of-order" },
    });
  });

  it("refuses picks past the maps played once a side has won", () => {
    expect(checkPickBans(FULL.slice(0, 8), { ...CTX, score: { a: 4, b: 0 } }).ok).toBe(true);
    expect(checkPickBans(FULL.slice(0, 9), { ...CTX, score: { a: 4, b: 0 } })).toMatchObject({
      error: { code: "bad-state" },
    });
  });

  it.each<[string, Partial<PickBanContext>]>([
    ["NaN best-of", { bestOf: Number.NaN }],
    ["even best-of", { bestOf: 4 }],
    ["NaN bans", { rules: { protects: 1, bans: Number.NaN, tiebreaker: null } }],
    ["negative protects", { rules: { protects: -1, bans: 1, tiebreaker: null } }],
    ["bad first side", { first: { ban: "x" as "a", pick: "b" } }],
  ])("refuses %s as bad-input", (_, change) => {
    expect(checkPickBans([], { ...CTX, ...change })).toMatchObject({
      error: { code: "bad-input" },
    });
  });

  it("stops at the score and only allows the tiebreaker at a tie", () => {
    const picks = FULL.slice(0, 10);
    expect(unwrap(checkPickBans(picks, { ...CTX, score: { a: 4, b: 2 } })).next).toBeNull();
    expect(unwrap(checkPickBans(picks, { ...CTX, score: { a: 3, b: 3 } })).next).toEqual({
      side: null,
      action: "tiebreaker",
    });
    expect(unwrap(checkPickBans(picks, { ...CTX, score: { a: 2, b: 3 } })).next).toBeNull();
    expect(checkPickBans(FULL, { ...CTX, score: { a: 4, b: 2 } })).toMatchObject({
      error: { code: "bad-state" },
    });
    expect(
      unwrap(checkPickBans(picks, { ...CTX, rules: { ...CTX.rules, tiebreaker: null } })).next,
    ).toBeNull();
  });

  it("works with custom buckets and no slot", () => {
    const ctx = {
      ...CTX,
      pool: {
        slots: [
          { mod: "EZ", index: 1 },
          { mod: null, index: 2 },
          { mod: "TB", index: 1 },
        ],
      },
      rules: { protects: 0, bans: 0, tiebreaker: K("TB", 1) },
      bestOf: 3,
    };
    const state = unwrap(
      checkPickBans([p("b", "pick", K("EZ", 1)), p("a", "pick", K(null, 2))], ctx),
    );
    expect(state.next).toEqual({ side: null, action: "tiebreaker" });
  });

  const refusals: [string, PickBanEntry[], Partial<PickBanContext>, string][] = [
    ["unknown slot", [p("a", "protect", K("FM", 1))], {}, "bad-slot"],
    [
      "tiebreaker not in pool",
      [],
      { rules: { protects: 0, bans: 0, tiebreaker: K("TB", 2) } },
      "bad-slot",
    ],
    ["no side", [p(null, "protect", K("NM", 1))], {}, "bad-side"],
    [
      "tiebreaker with a side",
      [...FULL.slice(0, 10), p("a", "tiebreaker", K("TB", 1))],
      {},
      "bad-side",
    ],
    [
      "wrong tiebreaker slot",
      [...FULL.slice(0, 10), p(null, "tiebreaker", K("NM", 4))],
      {},
      "bad-state",
    ],
    ["early tiebreaker", [p(null, "tiebreaker", K("TB", 1))], {}, "bad-state"],
    [
      "no tiebreaker set",
      [p(null, "tiebreaker", K("TB", 1))],
      { rules: { protects: 0, bans: 0, tiebreaker: null } },
      "bad-state",
    ],
    ["after the tiebreaker", [...FULL, p("b", "pick", K("NM", 4))], {}, "bad-state"],
    [
      "banning the tiebreaker",
      [p("a", "protect", K("NM", 1)), p("b", "protect", K("HD", 1)), p("a", "ban", K("TB", 1))],
      {},
      "bad-slot",
    ],
    ["wrong protect turn", [p("b", "protect", K("NM", 1))], {}, "out-of-order"],
    [
      "protect after a ban",
      [p("a", "ban", K("NM", 1)), p("b", "protect", K("NM", 2))],
      { rules: { protects: 1, bans: 1, tiebreaker: null } },
      "out-of-order",
    ],
    [
      "protect after a pick",
      [p("b", "pick", K("NM", 1)), p("a", "protect", K("NM", 2))],
      { rules: { protects: 1, bans: 0, tiebreaker: null } },
      "out-of-order",
    ],
    [
      "too many protects",
      [p("a", "protect", K("NM", 1)), p("b", "protect", K("NM", 2)), p("a", "protect", K("NM", 3))],
      {},
      "limit",
    ],
    [
      "protect twice",
      [p("a", "protect", K("NM", 1)), p("b", "protect", K("NM", 1))],
      {},
      "bad-slot",
    ],
    ["wrong ban turn", [...FULL.slice(0, 2), p("b", "ban", K("DT", 1))], {}, "out-of-order"],
    ["too many bans", [...FULL.slice(0, 4), p("a", "ban", K("NM", 4))], {}, "limit"],
    ["ban a protect", [...FULL.slice(0, 2), p("a", "ban", K("HD", 1))], {}, "bad-slot"],
    ["ban own protect", [...FULL.slice(0, 2), p("a", "ban", K("NM", 1))], {}, "bad-slot"],
    ["ban twice", [...FULL.slice(0, 3), p("b", "ban", K("DT", 1))], {}, "bad-slot"],
    ["wrong pick turn", [...FULL.slice(0, 4), p("a", "pick", K("NM", 2))], {}, "out-of-order"],
    ["pick a ban", [...FULL.slice(0, 4), p("b", "pick", K("DT", 1))], {}, "bad-slot"],
    ["pick twice", [...FULL.slice(0, 5), p("a", "pick", K("NM", 1))], {}, "bad-slot"],
    ["too many picks", [...FULL.slice(0, 10), p("b", "pick", K("NM", 4))], {}, "limit"],
  ];

  it.each(refusals)("refuses %s", (_, log, change, code) => {
    expect(checkPickBans(log, { ...CTX, ...change })).toMatchObject({ ok: false, error: { code } });
  });
});
