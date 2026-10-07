/**
 * @file tests/pickban-phases.test.ts
 * @desc Pick/ban phase order: split bans with `next` and `phase` at each step, swap, the 0.1
 *       shorthand against the 0.1 code (a seeded fuzz: same state or same error code), the
 *       expanded list, malformed phases, protecting a picked slot.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { slotKey } from "@haruhimemoe/pool";
import { describe, expect, it } from "vitest";
import type { PickBanEntry } from "../src/match.js";
import { checkPickBans, type PickBanContext } from "../src/pickban.js";
import { type PickBanPhase, pickBanPhases } from "../src/pickban-phases.js";
import { freeze, rng, unwrap } from "./fixtures.js";
import { checkPickBans as checkV01 } from "./pickban-v01.js";

const K = (mod: string | null, index: number) => slotKey({ mod, index });
const SLOTS = [
  ...[1, 2, 3, 4, 5].map((index) => ({ mod: "NM", index, beatmapId: index })),
  ...[1, 2, 3].map((index) => ({ mod: "HD", index, beatmapId: 10 + index })),
  ...[1, 2, 3].map((index) => ({ mod: "HR", index, beatmapId: 20 + index })),
  ...[1, 2, 3].map((index) => ({ mod: "DT", index, beatmapId: 30 + index })),
  { mod: "TB", index: 1, beatmapId: 99 },
];
const KEYS = SLOTS.map(slotKey);
const ph = (action: PickBanPhase["action"], count: number | null, swap = false): PickBanPhase => ({
  action,
  count,
  swap,
});
const p = (side: "a" | "b" | null, action: PickBanEntry["action"], slot: string): PickBanEntry => ({
  side,
  action,
  slot,
});
const SPLIT: PickBanContext = freeze({
  pool: { slots: SLOTS },
  rules: {
    protects: 0,
    bans: 0,
    tiebreaker: K("TB", 1),
    phases: [ph("ban", 2), ph("pick", 4), ph("ban", 2, true), ph("pick", null)],
  },
  bestOf: 9,
  first: { ban: "a", pick: "b" },
});

describe("phases", () => {
  it("runs split bans with next and phase at every step", () => {
    const log = [
      p("a", "ban", K("DT", 1)),
      p("b", "ban", K("HR", 1)),
      p("b", "pick", K("NM", 1)),
      p("a", "pick", K("NM", 2)),
      p("b", "pick", K("HD", 1)),
      p("a", "pick", K("HD", 2)),
      p("b", "ban", K("NM", 3)),
      p("a", "ban", K("NM", 4)),
      p("b", "pick", K("DT", 2)),
      p("a", "pick", K("HR", 2)),
      p("b", "pick", K("NM", 5)),
      p("a", "pick", K("DT", 3)),
      p(null, "tiebreaker", K("TB", 1)),
    ];
    const next = log.map((e) =>
      e.side ? { side: e.side, action: e.action } : { side: null, action: "tiebreaker" },
    );
    const phase = [0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 3, 3, null, null];
    for (let n = 0; n <= log.length; n++) {
      const state = unwrap(checkPickBans(log.slice(0, n), SPLIT));
      expect(state.next).toEqual(next[n] ?? null);
      expect(state.phase).toBe(phase[n]);
    }
    const end = unwrap(checkPickBans(log, SPLIT));
    expect(end.banned).toEqual({ a: [K("DT", 1), K("NM", 4)], b: [K("HR", 1), K("NM", 3)] });
    expect(end.picked).toHaveLength(8);
  });

  it("refuses split bans out of phase", () => {
    const two = [p("a", "ban", K("DT", 1)), p("b", "ban", K("HR", 1))];
    const at = (log: PickBanEntry[]) => checkPickBans(log, SPLIT);
    expect(at([...two, p("a", "ban", K("NM", 1))])).toMatchObject({
      error: { code: "out-of-order" },
    });
    expect(at([p("b", "pick", K("NM", 1))])).toMatchObject({ error: { code: "out-of-order" } });
    expect(at([...two, p("a", "pick", K("NM", 1))])).toMatchObject({
      error: { code: "out-of-order" },
    });
    expect(at([p("a", "protect", K("NM", 1))])).toMatchObject({ error: { code: "limit" } });
    expect(at([p("b", "protect", K("NM", 1))])).toMatchObject({ error: { code: "out-of-order" } });
  });

  it("refuses protecting a slot already picked or banned", () => {
    const ctx: PickBanContext = {
      ...SPLIT,
      rules: { ...SPLIT.rules, phases: [ph("pick", 2), ph("protect", 2), ph("pick", null)] },
    };
    const log = [p("b", "pick", K("NM", 1)), p("a", "pick", K("NM", 2))];
    expect(
      checkPickBans([...log, p("a", "protect", K("NM", 1))], {
        ...ctx,
        first: { ban: "a", pick: "b" },
      }),
    ).toMatchObject({
      error: { code: "bad-slot" },
    });
    expect(unwrap(checkPickBans([...log, p("a", "protect", K("NM", 3))], ctx)).protected.a).toEqual(
      [K("NM", 3)],
    );
  });

  it("stops at bestOf - 1 picks even with phases left", () => {
    const ctx: PickBanContext = {
      ...SPLIT,
      bestOf: 5,
      rules: { ...SPLIT.rules, phases: [ph("pick", 4), ph("ban", 2)] },
    };
    const picks = [
      p("b", "pick", K("NM", 1)),
      p("a", "pick", K("NM", 2)),
      p("b", "pick", K("NM", 3)),
      p("a", "pick", K("NM", 4)),
    ];
    expect(unwrap(checkPickBans(picks, ctx)).next).toEqual({ side: null, action: "tiebreaker" });
    expect(checkPickBans([...picks, p("b", "pick", K("NM", 5))], ctx)).toMatchObject({
      error: { code: "limit" },
    });
    expect(
      unwrap(checkPickBans([...picks, p(null, "tiebreaker", K("TB", 1))], ctx)).tiebreaker,
    ).toBe(true);
  });

  it("starts a swapped phase from the other side", () => {
    const ctx = { ...SPLIT, rules: { ...SPLIT.rules, phases: [ph("ban", 1, true)] } };
    expect(unwrap(checkPickBans([], ctx)).next).toEqual({ side: "b", action: "ban" });
    expect(unwrap(checkPickBans([p("b", "ban", K("NM", 1))], ctx)).next).toEqual({
      side: "b",
      action: "pick",
    });
  });

  it("expands the order of play", () => {
    expect(unwrap(pickBanPhases({ protects: 1, bans: 2 }))).toEqual([
      ph("protect", 2),
      ph("ban", 4),
      ph("pick", null),
    ]);
    expect(unwrap(pickBanPhases({ protects: 0, bans: 0 }))).toEqual([ph("pick", null)]);
    expect(unwrap(pickBanPhases({ protects: 3, bans: 3, phases: [ph("ban", 2)] }))).toEqual([
      ph("ban", 2),
      ph("pick", null),
    ]);
    expect(
      unwrap(pickBanPhases({ protects: 0, bans: 0, phases: [ph("pick", null, true)] })),
    ).toEqual([ph("pick", null, true)]);
  });

  it.each([
    [[ph("pick", null), ph("ban", 2)]],
    [[ph("ban", null)]],
    [[ph("ban", 0)]],
    [Array.from({ length: 17 }, () => ph("ban", 2))],
  ])("refuses malformed phases %#", (phases) => {
    expect(pickBanPhases({ protects: 0, bans: 0, phases })).toMatchObject({
      error: { code: "bad-input" },
    });
    expect(checkPickBans([], { ...SPLIT, rules: { ...SPLIT.rules, phases } })).toMatchObject({
      error: { code: "bad-input" },
    });
  });
});

describe("the 0.1 shorthand", () => {
  // Random logs, mostly legal-looking, against the 0.1 code: same state or the same error code.
  const random = rng(7);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const cases: { log: PickBanEntry[]; ctx: PickBanContext }[] = [];
  for (let c = 0; c < 4000; c++) {
    const rules = {
      protects: pick([0, 1, 2]),
      bans: pick([0, 1, 2]),
      tiebreaker: pick([K("TB", 1), null]),
    };
    const bestOf = pick([1, 3, 5, 7, 9]);
    const first = {
      ban: pick(["a", "b"] as const),
      pick: pick(["a", "b"] as const),
      ...(random() < 0.3 ? { protect: pick(["a", "b"] as const) } : {}),
    };
    const score =
      random() < 0.3 ? { a: pick([0, 1, 2, 3, 4, 5]), b: pick([0, 1, 2, 3, 4]) } : undefined;
    const length = Math.floor(random() * 14);
    const log: PickBanEntry[] = [];
    let flip = random() < 0.5;
    for (let i = 0; i < length; i++) {
      flip = random() < 0.85 ? !flip : flip;
      const action =
        random() < 0.05 ? "tiebreaker" : pick(["protect", "ban", "pick", "pick"] as const);
      const side = action === "tiebreaker" ? null : flip ? "a" : "b";
      log.push(p(side, action, random() < 0.1 ? K("TB", 1) : pick(KEYS.slice(0, 8))));
    }
    cases.push({
      log,
      ctx: { pool: { slots: SLOTS }, rules, bestOf, first, ...(score ? { score } : {}) },
    });
  }

  it("matches 0.1 on 4000 random logs", () => {
    let accepted = 0;
    for (const { log, ctx } of cases) {
      const before = checkV01(log, ctx);
      const now = checkPickBans(log, ctx);
      if (before.ok && now.ok) {
        accepted++;
        const { phase: _, ...rest } = now.value;
        expect(rest).toEqual(before.value);
      } else {
        const got = [now.ok, now.ok ? null : now.error.code];
        const want = [before.ok, before.ok ? null : before.error.code];
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          throw new Error(JSON.stringify({ log, ctx, got, want, now, before }));
        }
      }
    }
    expect(accepted).toBeGreaterThan(300);
  });

  it("gives the same result as the explicit phases", () => {
    for (const { log, ctx } of cases.slice(0, 1000)) {
      const { protects, bans } = ctx.rules;
      const phases = [
        ...(protects ? [ph("protect", protects * 2)] : []),
        ...(bans ? [ph("ban", bans * 2)] : []),
      ];
      const short = checkPickBans(log, ctx);
      const long = checkPickBans(log, { ...ctx, rules: { ...ctx.rules, phases } });
      if (short.ok) expect(long).toEqual(short);
      // An empty shorthand phase can make 0.1 say out-of-order where the explicit list says limit.
      else expect(long.ok).toBe(false);
    }
  });
});
