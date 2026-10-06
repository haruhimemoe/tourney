/**
 * @file src/ids.ts
 * @desc Shared field schemas: string ids, osu! user ids, ISO instants, match sides.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";

/** Any non-empty id an app uses (a Mongo ObjectId string, a uuid, a slug). */
export const IdSchema = z.string().min(1).max(128);

/** An osu! user id. */
export const OsuIdSchema = z.number().int().positive();

/** An ISO 8601 date-time with a zone or offset. */
export const InstantSchema = z.iso.datetime({ offset: true });

/** One side of a match. */
export const SideSchema = z.enum(["a", "b"]);

/** One side of a match. */
export type Side = z.infer<typeof SideSchema>;

/**
 * @function otherSide
 * @param side {Side} a side
 * @returns {Side} the opponent
 */
export const otherSide = (side: Side): Side => (side === "a" ? "b" : "a");
