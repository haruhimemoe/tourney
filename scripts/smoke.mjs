/**
 * @file scripts/smoke.mjs
 * @desc Imports the built package through its own exports map, the way Node consumers will, and
 *       runs a 4-entrant double elimination bracket to a champion. Run by `bun run test:dist`.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const { createBracket, reportResult, champion, checkPickBans, buildLadder, BracketSchema } =
  await import("@haruhimemoe/tourney");

assert.ok(existsSync("dist/index.d.ts"), "types are built");

const created = createBracket({ entrants: ["a", "b", "c", "d"], format: "double", bestOf: 7 });
assert.ok(created.ok);
let bracket = created.value;
for (
  let m = bracket.matches.find((x) => x.status === "ready");
  m;
  m = bracket.matches.find((x) => x.status === "ready")
) {
  const next = reportResult(bracket, m.code, { scoreA: 4, scoreB: 2 });
  assert.ok(next.ok, m.code);
  bracket = next.value;
}
assert.equal(champion(bracket), "a");
assert.ok(BracketSchema.safeParse(bracket).success);

const ladder = buildLadder({ size: 16, format: "double", qualifiers: true, bestOf: 9 });
assert.ok(ladder.ok);
assert.equal(ladder.value.length, 12);

const state = checkPickBans([{ side: "a", action: "ban", slot: "b:NM#1" }], {
  pool: {
    slots: [
      { mod: "NM", index: 1 },
      { mod: "NM", index: 2 },
    ],
  },
  rules: { protects: 0, bans: 1, tiebreaker: null },
  bestOf: 3,
  first: { ban: "a", pick: "b" },
});
assert.ok(state.ok);
assert.deepEqual(state.value.next, { side: "b", action: "ban" });

console.log("smoke: ok");
