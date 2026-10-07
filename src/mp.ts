/**
 * @file src/mp.ts
 * @desc @haruhimemoe/tourney/mp: fromOsuMatch turns an osu! multiplayer match (an mp link, read
 *       with @haruhimemoe/osu) into the maps of a tourney match: each game's pool slot, lineups,
 *       per-player scores and winner, the score, and a list of problems for the referee (maps
 *       off the pool, unknown players, aborts, repeats). Never throws.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { gameStatus, gameWinner, matchGames, type WinCondition } from "@haruhimemoe/osu/match";
import type { MatchGame, OsuMatch } from "@haruhimemoe/osu/shapes";
import { type SlotBucket, slotKey } from "@haruhimemoe/pool";
import type { Side } from "./ids.js";
import { MAX_BEST_OF } from "./ladder.js";
import { checkScore, type MapResult, scoreFromMaps, winsNeeded } from "./match.js";
import { checkSides, type MpSides, scoreSide } from "./mp-sides.js";
import { fail, ok, type Result } from "./result.js";

export type { MpSide, MpSides } from "./mp-sides.js";

/** Problem codes, for a referee to look at. */
export type MatchProblemCode =
  | "off-pool"
  | "unknown-player"
  | "no-side"
  | "aborted"
  | "in-progress"
  | "duplicate-pick"
  | "tie"
  | "after-win";

/** One problem with one game. */
export type MatchProblem = { code: MatchProblemCode; gameId: number; message: string };

/** What fromOsuMatch takes besides the match. */
export type FromOsuOptions = {
  /** The round's pool; games are matched to slots by beatmap id. */
  pool: { slots: readonly { mod: SlotBucket; index: number; beatmapId: number }[] };
  sides: MpSides;
  /** Completed games at the start (after `skip`) that are warmups. Default 0. */
  warmups?: number | undefined;
  /** osu! game ids to leave out, e.g. a replayed map's first try. */
  skip?: readonly number[] | undefined;
  /** What a game is won on. Default: the room's win condition. */
  by?: WinCondition | undefined;
  /** Count only passed scores. Default false. */
  passedOnly?: boolean | undefined;
  /** The match's best-of: sets `winner` and flags maps played after a side won. */
  bestOf?: number | undefined;
};

/** The match as tourney data. */
export type FromOsuResult = {
  maps: MapResult[];
  score: { a: number; b: number };
  winner: Side | null;
  problems: MatchProblem[];
};

const isBestOf = (n: number): boolean =>
  Number.isInteger(n) && n >= 1 && n <= MAX_BEST_OF && n % 2 === 1;

/**
 * @function fromOsuMatch
 * @param osu {OsuMatch} a match from @haruhimemoe/osu (getMatch, or toOsuMatch on a page)
 * @param options {FromOsuOptions} pool, sides, warmups, games to skip, win condition, best-of
 * @returns {Result<FromOsuResult>} the maps (pool games, warmups and aborts on the pool), score,
 *          winner and problems; bad-input for bad options. Games off the pool, still in progress,
 *          repeated or after the win are left out of `maps` and listed as problems
 */
export const fromOsuMatch = (osu: OsuMatch, options: FromOsuOptions): Result<FromOsuResult> => {
  const { pool, sides, warmups = 0, skip = [], bestOf } = options;
  if (!Number.isSafeInteger(warmups) || warmups < 0) {
    return fail("bad-input", "warmups is a whole number from 0");
  }
  if (bestOf !== undefined && !isBestOf(bestOf)) {
    return fail("bad-input", "best-of must be an odd number from 1 to 25");
  }
  const checked = checkSides(sides);
  if (!checked.ok) return checked;
  const slots = new Map<number, string>();
  for (const slot of pool.slots) {
    if (slots.has(slot.beatmapId))
      return fail("bad-input", `map ${slot.beatmapId} is in the pool twice`);
    slots.set(slot.beatmapId, slotKey(slot));
  }
  const games = matchGames(osu);
  const maps: MapResult[] = [];
  const problems: MatchProblem[] = [];
  const flag = (code: MatchProblemCode, game: MatchGame, message: string) =>
    problems.push({ code, gameId: game.id, message });
  const need = bestOf === undefined ? null : winsNeeded(bestOf);
  const played = new Set<string>();
  let completed = 0;

  for (const [i, game] of games.entries()) {
    if (skip.includes(game.id)) continue;
    const status = gameStatus(game, i < games.length - 1);
    const slot = slots.get(game.beatmapId);
    if (status === "in_progress") {
      flag("in-progress", game, `game ${game.id} is still being played`);
      continue;
    }
    if (status === "aborted") {
      flag("aborted", game, `game ${game.id} was aborted`);
      if (slot)
        maps.push({ ...readGame(game, slot, sides, options).map, aborted: true, winner: null });
      continue;
    }
    if (completed++ < warmups) {
      if (slot) maps.push({ ...readGame(game, slot, sides, options).map, warmup: true });
      continue;
    }
    if (!slot) {
      flag("off-pool", game, `game ${game.id}: map ${game.beatmapId} is not in the pool`);
      continue;
    }
    const score = scoreFromMaps(maps);
    if (need !== null && (score.a >= need || score.b >= need)) {
      flag("after-win", game, `game ${game.id} was played after the match was won`);
      continue;
    }
    if (played.has(slot)) {
      flag("duplicate-pick", game, `game ${game.id}: ${slot} was already played`);
      continue;
    }
    const read = readGame(game, slot, sides, options);
    for (const [code, message] of read.problems) flag(code, game, message);
    if (read.map.winner === null) flag("tie", game, `game ${game.id} has no winner`);
    // A tie is replayed on the same slot, so only a decided map takes the slot.
    if (read.map.winner !== null) played.add(slot);
    maps.push(read.map);
  }
  const score = scoreFromMaps(maps);
  const decided = bestOf === undefined ? null : checkScore(bestOf, score.a, score.b);
  return ok({ maps, score, winner: decided?.ok ? decided.value : null, problems });
};

/** One game as a map result, with its player problems. */
const readGame = (
  game: MatchGame,
  slot: string,
  sides: MpSides,
  options: FromOsuOptions,
): { map: MapResult; problems: [MatchProblemCode, string][] } => {
  const problems: [MatchProblemCode, string][] = [];
  const placed: { score: MatchGame["scores"][number]; side: Side }[] = [];
  for (const score of game.scores) {
    const { side, known } = scoreSide(score, sides);
    if (side === null) {
      problems.push(["no-side", `game ${game.id}: player ${score.userId} is on neither side`]);
      continue;
    }
    if (!known) {
      problems.push(["unknown-player", `game ${game.id}: player ${score.userId} is not listed`]);
    }
    placed.push({ score, side });
  }
  // osu!'s own winner, on a copy where side a plays red and side b blue.
  const copy: MatchGame = {
    ...game,
    teamType: "team-vs",
    scores: placed.map(({ score, side }) => ({ ...score, team: side === "a" ? "red" : "blue" })),
  };
  const { winner } = gameWinner(copy, { by: options.by, passedOnly: options.passedOnly });
  const lineup = (side: Side) => [
    ...new Set(placed.filter((p) => p.side === side).map((p) => p.score.userId)),
  ];
  const map: MapResult = {
    slot,
    gameId: game.id,
    winner: winner === "red" ? "a" : winner === "blue" ? "b" : null,
    warmup: false,
    aborted: false,
    lineupA: lineup("a").slice(0, 16),
    lineupB: lineup("b").slice(0, 16),
    scores: placed.slice(0, 64).map(({ score, side }) => ({
      osuId: score.userId,
      side,
      score: Math.max(0, Math.round(score.score)),
      accuracy: Math.min(1, Math.max(0, score.accuracy)),
      maxCombo: score.maxCombo,
      misses: score.misses,
      mods: [...new Set([...game.mods, ...score.mods])]
        .filter((m) => m.length >= 1 && m.length <= 8)
        .slice(0, 32),
      passed: score.passed,
    })),
  };
  return { map, problems };
};
