/**
 * @file tests/mp.test.ts
 * @desc fromOsuMatch: a 1v1 head-to-head lobby, a 3v3 team vs lobby with a sub swapping in,
 *       warmups (one aborted), aborts, an unclosed game, off-pool maps, unknown players placed
 *       by colour, scores with no side, repeated picks, skip, ties, maps after the win, the
 *       accuracy win condition, and bad options.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { MatchGame, MatchScore, OsuMatch } from "@haruhimemoe/osu/shapes";
import { slotKey } from "@haruhimemoe/pool";
import { describe, expect, it } from "vitest";
import { MapResultSchema } from "../src/match.js";
import { type FromOsuOptions, fromOsuMatch } from "../src/mp.js";
import { freeze, unwrap } from "./fixtures.js";

const K = (mod: string, index: number) => slotKey({ mod, index });
const POOL = {
  slots: [
    { mod: "NM", index: 1, beatmapId: 101 },
    { mod: "NM", index: 2, beatmapId: 102 },
    { mod: "HD", index: 1, beatmapId: 201 },
    { mod: "HR", index: 1, beatmapId: 301 },
    { mod: "TB", index: 1, beatmapId: 901 },
  ],
};

type Play = [userId: number, score: number, extra?: Partial<MatchScore>];
let nextId = 1;
const game = (beatmapId: number, plays: Play[], extra: Partial<MatchGame> = {}): MatchGame => ({
  id: nextId++,
  beatmapId,
  startTime: "2026-10-06T10:00:00Z",
  endTime: "2026-10-06T10:05:00Z",
  ruleset: "osu",
  scoringType: "scorev2",
  teamType: "head-to-head",
  mods: [],
  beatmap: null,
  scores: plays.map(([userId, score, more], slot) => ({
    userId,
    slot,
    team: "none",
    score,
    accuracy: 0.97,
    maxCombo: 500,
    misses: 1,
    mods: [],
    passed: true,
    ...more,
  })),
  ...extra,
});
const match = (games: MatchGame[]): OsuMatch =>
  freeze({
    id: 1,
    name: "EGC: (Moss) vs (Fern)",
    startTime: "2026-10-06T10:00:00Z",
    endTime: null,
    events: games.map((g, i) => ({
      id: i + 1,
      type: "other",
      text: null,
      timestamp: g.startTime,
      userId: null,
      game: g,
    })),
    users: [],
    firstEventId: 1,
    latestEventId: games.length,
  });
const SOLO: FromOsuOptions = {
  pool: POOL,
  sides: { a: { players: [1] }, b: { players: [2] } },
  bestOf: 5,
};

describe("fromOsuMatch, 1v1", () => {
  it("reads a head-to-head lobby with a warmup into maps, score and winner", () => {
    const osu = match([
      game(555, [
        [1, 900_000],
        [2, 800_000],
      ]),
      game(101, [
        [1, 900_000],
        [2, 800_000],
      ]),
      game(
        102,
        [
          [1, 700_000],
          [2, 800_000],
        ],
        { mods: ["HD"] },
      ),
      game(201, [
        [1, 990_000, { mods: ["HD"] }],
        [2, 100_000],
      ]),
      game(301, [
        [1, 990_000],
        [2, 100_000],
      ]),
    ]);
    const out = unwrap(fromOsuMatch(osu, { ...SOLO, warmups: 1 }));
    expect(out.maps.map((m) => [m.slot, m.winner])).toEqual([
      [K("NM", 1), "a"],
      [K("NM", 2), "b"],
      [K("HD", 1), "a"],
      [K("HR", 1), "a"],
    ]);
    expect(out.score).toEqual({ a: 3, b: 1 });
    expect(out.winner).toBe("a");
    expect(out.problems).toEqual([]);
    const first = out.maps[0];
    expect(first?.lineupA).toEqual([1]);
    expect(first?.scores[0]).toEqual({
      osuId: 1,
      side: "a",
      score: 900_000,
      accuracy: 0.97,
      maxCombo: 500,
      misses: 1,
      mods: [],
      passed: true,
    });
    expect(out.maps[1]?.scores[0]?.mods).toEqual(["HD"]);
    for (const map of out.maps) expect(MapResultSchema.parse(map)).toEqual(map);
  });

  it("keeps a pool warmup marked, drops an off-pool one, and does not count aborts as warmups", () => {
    const osu = match([
      game(101, [], { endTime: "2026-10-06T10:01:00Z" }),
      game(102, [
        [1, 5],
        [2, 6],
      ]),
      game(555, [
        [1, 5],
        [2, 6],
      ]),
      game(201, [
        [1, 5],
        [2, 6],
      ]),
    ]);
    const out = unwrap(fromOsuMatch(osu, { ...SOLO, warmups: 2 }));
    expect(out.maps.map((m) => [m.slot, m.warmup, m.aborted])).toEqual([
      [K("NM", 1), false, true],
      [K("NM", 2), true, false],
      [K("HD", 1), false, false],
    ]);
    expect(out.problems.map((p) => p.code)).toEqual(["aborted"]);
    expect(out.score).toEqual({ a: 0, b: 1 });
  });

  it("flags in-progress, unclosed, off-pool, repeated and after-win games", () => {
    const unclosed = game(
      102,
      [
        [1, 5],
        [2, 6],
      ],
      { endTime: null },
    );
    const osu = match([
      game(555, [
        [1, 5],
        [2, 6],
      ]),
      unclosed,
      game(101, [
        [1, 9],
        [2, 6],
      ]),
      game(101, [
        [1, 1],
        [2, 6],
      ]),
      game(201, [
        [1, 9],
        [2, 6],
      ]),
      game(301, [
        [1, 9],
        [2, 6],
      ]),
      game(102, [
        [1, 9],
        [2, 6],
      ]),
      game(
        901,
        [
          [1, 9],
          [2, 6],
        ],
        { endTime: null },
      ),
    ]);
    const out = unwrap(fromOsuMatch(osu, SOLO));
    expect(out.problems.map((p) => p.code)).toEqual([
      "off-pool",
      "aborted",
      "duplicate-pick",
      "after-win",
      "in-progress",
    ]);
    expect(out.problems[1]?.gameId).toBe(unclosed.id);
    expect(out.score).toEqual({ a: 3, b: 0 });
    expect(out.winner).toBe("a");
    expect(out.maps.find((m) => m.gameId === unclosed.id)).toMatchObject({
      aborted: true,
      winner: null,
    });
  });

  it("drops skipped games before anything else", () => {
    const first = game(101, [
      [1, 1],
      [2, 6],
    ]);
    const osu = match([
      first,
      game(101, [
        [1, 9],
        [2, 6],
      ]),
    ]);
    const out = unwrap(fromOsuMatch(osu, { ...SOLO, skip: [first.id] }));
    expect(out.problems).toEqual([]);
    expect(out.score).toEqual({ a: 1, b: 0 });
    expect(out.winner).toBeNull();
  });

  it("flags a tie and follows the win condition", () => {
    const osu = match([
      game(101, [
        [1, 5],
        [2, 5],
      ]),
      game(102, [
        [1, 9],
        [2, 1, { accuracy: 0.99 }],
      ]),
    ]);
    const out = unwrap(fromOsuMatch(osu, { ...SOLO, by: "accuracy" }));
    expect(out.maps.map((m) => m.winner)).toEqual([null, "b"]);
    expect(out.problems.map((p) => p.code)).toEqual(["tie"]);
    const failed = match([
      game(101, [
        [1, 9, { passed: false }],
        [2, 1],
      ]),
    ]);
    expect(unwrap(fromOsuMatch(failed, { ...SOLO, passedOnly: true })).maps[0]?.winner).toBe("b");
  });
});

describe("fromOsuMatch, review fixes", () => {
  it("counts the replay of a tied map", () => {
    const osu = match([
      game(101, [
        [1, 5],
        [2, 5],
      ]),
      game(101, [
        [1, 6],
        [2, 5],
      ]),
    ]);
    const out = unwrap(fromOsuMatch(osu, SOLO));
    expect(out.maps.map((m) => m.winner)).toEqual([null, "a"]);
    expect(out.problems.map((p) => p.code)).toEqual(["tie"]);
    expect(out.score).toEqual({ a: 1, b: 0 });
  });

  it("drops empty mods so maps stay valid", () => {
    const out = unwrap(
      fromOsuMatch(
        match([
          game(101, [
            [1, 6, { mods: ["", "HD"] }],
            [2, 5],
          ]),
        ]),
        SOLO,
      ),
    );
    expect(out.maps[0]?.scores[0]?.mods).toEqual(["HD"]);
    expect(MapResultSchema.safeParse(out.maps[0]).success).toBe(true);
  });
});

describe("fromOsuMatch, team vs", () => {
  const sides = {
    a: { players: [11, 12, 13, 14], team: "red" as const },
    b: { players: [21, 22, 23] },
  };
  const tv = (beatmapId: number, red: [number, number][], blue: [number, number][]) =>
    game(
      beatmapId,
      [
        ...red.map(([id, s]): Play => [id, s, { team: "red" }]),
        ...blue.map(([id, s]): Play => [id, s, { team: "blue" }]),
      ],
      { teamType: "team-vs" },
    );

  it("sums sides by player, with a sub swapping in and colours swapped", () => {
    const osu = match([
      tv(
        101,
        [
          [11, 300],
          [12, 300],
          [13, 300],
        ],
        [
          [21, 200],
          [22, 200],
          [23, 200],
        ],
      ),
      // Side a plays blue here and their sub 14 is in for 13.
      tv(
        102,
        [
          [21, 100],
          [22, 100],
          [23, 100],
        ],
        [
          [11, 300],
          [12, 300],
          [14, 300],
        ],
      ),
    ]);
    const out = unwrap(fromOsuMatch(osu, { pool: POOL, sides, bestOf: 3 }));
    expect(out.maps.map((m) => m.winner)).toEqual(["a", "a"]);
    expect(out.maps[1]?.lineupA).toEqual([11, 12, 14]);
    expect(out.maps[1]?.lineupB).toEqual([21, 22, 23]);
    expect(out.winner).toBe("a");
    expect(out.problems).toEqual([]);
  });

  it("places an unlisted player by colour and flags them, and flags a score with no side", () => {
    const osu = match([
      tv(
        101,
        [
          [11, 300],
          [99, 300],
        ],
        [
          [21, 200],
          [77, 900],
        ],
      ),
    ]);
    const out = unwrap(fromOsuMatch(osu, { pool: POOL, sides }));
    expect(out.problems.map((p) => p.code)).toEqual(["unknown-player", "no-side"]);
    expect(out.maps[0]?.lineupA).toEqual([11, 99]);
    expect(out.maps[0]?.lineupB).toEqual([21]);
    expect(out.maps[0]?.winner).toBe("a");
  });
});

describe("fromOsuMatch input", () => {
  it.each([
    [{ warmups: -1 }],
    [{ warmups: 1.5 }],
    [{ bestOf: 4 }],
    [{ sides: { a: { players: [1] }, b: { players: [1] } } }],
    [{ sides: { a: { players: [0] }, b: { players: [2] } } }],
    [{ sides: { a: { players: [1], team: "red" }, b: { players: [2], team: "red" } } }],
    [{ sides: { a: { players: [1], team: "green" }, b: { players: [2] } } }],
    [{ pool: { slots: [...POOL.slots, { mod: "DT", index: 1, beatmapId: 101 }] } }],
  ])("refuses bad options %#", (change) => {
    expect(
      fromOsuMatch(match([]), { ...SOLO, ...(change as Partial<FromOsuOptions>) }),
    ).toMatchObject({
      ok: false,
      error: { code: "bad-input" },
    });
  });

  it("reads an empty match", () => {
    expect(unwrap(fromOsuMatch(match([]), SOLO))).toEqual({
      maps: [],
      score: { a: 0, b: 0 },
      winner: null,
      problems: [],
    });
  });
});
