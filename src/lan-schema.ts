/**
 * @file src/lan-schema.ts
 * @desc LAN signups: statuses, attendee kinds, room stock, the signup schema, someone's kind
 *       from their tournament registrations, and a room price split into whole-unit shares.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { z } from "zod";
import { IdSchema, InstantSchema, OsuIdSchema } from "./ids.js";
import { PairCodeSchema } from "./lan-codes.js";
import type { Registration } from "./registration.js";

/** LAN signup statuses. */
export const LAN_STATUSES = ["pending", "accepted", "waitlisted", "rejected", "withdrawn"] as const;

/** A LAN signup status. */
export type LanStatus = (typeof LAN_STATUSES)[number];

/** The statuses that compete for seats: pending, accepted and waitlisted. */
export const ACTIVE_LAN_STATUSES: readonly LanStatus[] = ["pending", "accepted", "waitlisted"];

/** What someone is at the LAN, from their tournament registrations. */
export const ATTENDEE_KINDS = ["staff", "player", "attendee"] as const;

/** What someone is at the LAN. */
export type AttendeeKind = (typeof ATTENDEE_KINDS)[number];

/** One room type's stock: how many rooms (null: no limit) and beds per room. */
export const RoomStockSchema = z.object({
  rooms: z.number().int().min(0).nullable(),
  beds: z.union([z.literal(1), z.literal(2)]),
});

/** One room type's stock. */
export type RoomStock = z.infer<typeof RoomStockSchema>;

/**
 * One LAN signup. `kind` is the app's attendee kind (any string, ranked by the seating
 * priority), `room` a room type key, `roommateId` the signup it wants to share a room with.
 */
export const LanRegistrationSchema = z.object({
  id: IdSchema,
  osuId: OsuIdSchema,
  kind: z.string().min(1).max(32),
  status: z.enum(LAN_STATUSES),
  submittedAt: InstantSchema,
  room: z.string().min(1).max(64).nullable(),
  roommateId: IdSchema.nullable(),
  pairCode: PairCodeSchema.nullable(),
  hasCompanion: z.boolean(),
});

/** One LAN signup. */
export type LanRegistration = z.infer<typeof LanRegistrationSchema>;

/**
 * @function deriveAttendeeKind
 * @param registrations {readonly Pick<Registration, "kind" | "status">[]} one person's
 *        registrations for the tournament
 * @returns {AttendeeKind} staff with an approved staff registration, else player with a player
 *          registration that isn't rejected or withdrawn, else attendee
 */
export const deriveAttendeeKind = (
  registrations: readonly Pick<Registration, "kind" | "status">[],
): AttendeeKind => {
  if (registrations.some((r) => r.kind === "staff" && r.status === "approved")) return "staff";
  return registrations.some(
    (r) => r.kind === "player" && r.status !== "rejected" && r.status !== "withdrawn",
  )
    ? "player"
    : "attendee";
};

const MAX_PAYERS = 1000;

/**
 * @function roomShares
 * @param price {number} the room's price in whole minor units (cents), from 0
 * @param payers {number} how many share it, 1 to 1000
 * @returns {number[]} one whole-unit share per payer, summing to the price; the first payer
 *          takes what doesn't divide evenly. Empty for bad input
 */
export const roomShares = (price: number, payers: number): number[] => {
  if (!Number.isSafeInteger(price) || price < 0) return [];
  if (!Number.isSafeInteger(payers) || payers < 1 || payers > MAX_PAYERS) return [];
  const left = price % payers;
  const share = (price - left) / payers;
  return Array.from({ length: payers }, (_, i) => (i === 0 ? share + left : share));
};
