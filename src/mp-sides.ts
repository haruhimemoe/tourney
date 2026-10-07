/**
 * @file src/mp-sides.ts
 * @desc Which side of a tourney match each osu! score belongs to: by the players listed for each
 *       side (roster and subs), else by the team colour given for a side. Used by fromOsuMatch.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { MatchScore } from "@haruhimemoe/osu/shapes";
import { OsuIdSchema, type Side } from "./ids.js";
import { fail, ok, type Result } from "./result.js";

/** One side in the lobby: its players by osu! id, and its team colour in team vs if fixed. */
export type MpSide = { players: readonly number[]; team?: "red" | "blue" | undefined };

/** Both sides. A player may only be on one. */
export type MpSides = { a: MpSide; b: MpSide };

/** A score's side, and whether its player was listed (false: placed by team colour). */
export type ScoreSide = { side: Side | null; known: boolean };

/**
 * @function checkSides
 * @param sides {MpSides} both sides
 * @returns {Result<true>} ok, or bad-input for a bad osu! id, a player on both sides, a bad
 *          colour or both sides with the same colour
 */
export const checkSides = (sides: MpSides): Result<true> => {
  const all = [...sides.a.players, ...sides.b.players];
  if (!all.every((id) => OsuIdSchema.safeParse(id).success)) {
    return fail("bad-input", "players are osu! ids");
  }
  if (new Set(all).size !== all.length) return fail("bad-input", "a player is listed twice");
  const colours = [sides.a.team, sides.b.team].filter((team) => team !== undefined);
  if (!colours.every((team) => team === "red" || team === "blue")) {
    return fail("bad-input", "a team colour is red or blue");
  }
  if (colours.length === 2 && colours[0] === colours[1]) {
    return fail("bad-input", "the sides have the same colour");
  }
  return ok(true);
};

/**
 * @function scoreSide
 * @param score {MatchScore} one osu! score
 * @param sides {MpSides} both sides
 * @returns {ScoreSide} the side by player, else by team colour (known false), else none
 */
export const scoreSide = (score: MatchScore, sides: MpSides): ScoreSide => {
  if (sides.a.players.includes(score.userId)) return { side: "a", known: true };
  if (sides.b.players.includes(score.userId)) return { side: "b", known: true };
  if (score.team !== "none" && sides.a.team === score.team) return { side: "a", known: false };
  if (score.team !== "none" && sides.b.team === score.team) return { side: "b", known: false };
  return { side: null, known: false };
};
