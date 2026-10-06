/**
 * @file tests/ids.test.ts
 * @desc Shared field schemas and otherSide.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { IdSchema, InstantSchema, OsuIdSchema, otherSide } from "../src/ids.js";

describe("ids", () => {
  it("takes any non-empty string id up to 128, including ObjectIds", () => {
    expect(IdSchema.safeParse("665f1c2b9a1e4c0012345678").success).toBe(true);
    expect(IdSchema.safeParse("team-moss").success).toBe(true);
    expect(IdSchema.safeParse("").success).toBe(false);
    expect(IdSchema.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("checks osu! ids and instants", () => {
    expect(OsuIdSchema.safeParse(2).success).toBe(true);
    expect(OsuIdSchema.safeParse(0).success).toBe(false);
    expect(InstantSchema.safeParse("2026-08-08T18:00:00+02:00").success).toBe(true);
    expect(InstantSchema.safeParse("2026-08-08").success).toBe(false);
  });

  it("flips sides", () => {
    expect([otherSide("a"), otherSide("b")]).toEqual(["b", "a"]);
  });
});
