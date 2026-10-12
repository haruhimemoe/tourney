/**
 * @file src/lan-allocate.ts
 * @desc LAN seating and rooms. Active signups seat by kind priority, then submit time, then id,
 *       up to a capacity, and the rest wait; companions take the seats left after every signup.
 *       Rooms go to groups in seating order: two signups on one 2-bed room type that name each
 *       other share a room, anyone else gets one alone, while each type's stock lasts.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import {
  ACTIVE_LAN_STATUSES,
  type LanRegistration,
  type RoomStock,
  RoomStockSchema,
} from "./lan-schema.js";
import { fail, ok, type Result } from "./result.js";

/** What seating reads from a signup. */
export type LanEntry = Pick<
  LanRegistration,
  "id" | "kind" | "status" | "submittedAt" | "room" | "roommateId" | "hasCompanion"
>;

/** The seats and rooms there are, and the order kinds seat in. */
export type LanLimits = {
  /** Seats, companions included; null for no limit. */
  capacity: number | null;
  /** Room types by key. */
  inventory: Readonly<Record<string, RoomStock>>;
  /** Kinds in seating order; a kind not listed seats after all of them. */
  priority: readonly string[];
};

/** Signups that share one room: a pair that named each other, or one signup alone. */
export type RoomGroup = {
  /** "room:" and the smallest member id, whoever signed up first. */
  key: string;
  room: string;
  memberIds: string[];
  /** The signup whose companion takes the second bed of a 2-bed room. */
  companionOf: string | null;
  /** A 2-bed room with one person in it. */
  emptyBed: boolean;
};

/** Who is seated, who waits, and who has a room. Ids are in seating order. */
export type LanAllocation = {
  accepted: string[];
  waitlisted: string[];
  /** Accepted signups whose companion has no seat. */
  companionShort: string[];
  roomed: string[];
  /** Accepted signups on a room type who got no room. */
  roomShort: string[];
  /** Rooms given out, per room type. */
  roomsUsed: Record<string, number>;
  /** Accepted signups plus seated companions. */
  headcount: number;
};

const isActive = (entry: Pick<LanEntry, "status">): boolean =>
  ACTIVE_LAN_STATUSES.includes(entry.status);

// Own keys only, so a room called "constructor" never finds Object.prototype.
const stockOf = (inventory: LanLimits["inventory"], room: string | null): RoomStock | undefined =>
  room !== null && Object.hasOwn(inventory, room) ? inventory[room] : undefined;

const rankOf = (priority: readonly string[], kind: string): number => {
  const rank = priority.indexOf(kind);
  return rank === -1 ? priority.length : rank;
};

const byTimeThenId = (a: LanEntry, b: LanEntry): number =>
  Date.parse(a.submittedAt) - Date.parse(b.submittedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * @function seatingOrder
 * @param entries {readonly T[]} signups
 * @param priority {readonly string[]} kinds in seating order
 * @returns {T[]} a sorted copy: by kind (a kind not in priority after all of them), then submit
 *          time, then id
 */
export const seatingOrder = <T extends LanEntry>(
  entries: readonly T[],
  priority: readonly string[],
): T[] =>
  [...entries].sort(
    (a, b) => rankOf(priority, a.kind) - rankOf(priority, b.kind) || byTimeThenId(a, b),
  );

/**
 * @function roomGroups
 * @param entries {readonly LanEntry[]} signups; rejected and withdrawn ones are skipped
 * @param limits {Pick<LanLimits, "inventory" | "priority">} room types and kind priority
 * @returns {RoomGroup[]} who shares a room, in seating order of each group's first member: two
 *          signups on one 2-bed room type whose roommateIds point at each other share one, and
 *          anyone else on a room type in the inventory gets one alone
 */
export const roomGroups = (
  entries: readonly LanEntry[],
  limits: Pick<LanLimits, "inventory" | "priority">,
): RoomGroup[] => {
  const all = new Map(entries.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const groups: RoomGroup[] = [];
  for (const e of seatingOrder(entries.filter(isActive), limits.priority)) {
    const stock = stockOf(limits.inventory, e.room);
    if (seen.has(e.id) || e.room === null || !stock) continue;
    const mate = e.roommateId === null ? undefined : all.get(e.roommateId);
    const paired =
      stock.beds === 2 &&
      !!mate &&
      !seen.has(mate.id) &&
      isActive(mate) &&
      mate.room === e.room &&
      mate.roommateId === e.id;
    const memberIds = paired && mate ? [e.id, mate.id] : [e.id];
    for (const id of memberIds) seen.add(id);
    const companionOf = !paired && e.hasCompanion && stock.beds === 2 ? e.id : null;
    groups.push({
      key: `room:${[...memberIds].sort()[0]}`,
      room: e.room,
      memberIds,
      companionOf,
      emptyBed: stock.beds === 2 && !paired && !companionOf,
    });
  }
  return groups;
};

const checkLimits = (entries: readonly LanEntry[], limits: LanLimits): string | null => {
  const { capacity } = limits;
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 0)) {
    return "capacity is null or a whole number from 0";
  }
  for (const [room, stock] of Object.entries(limits.inventory)) {
    if (!RoomStockSchema.safeParse(stock).success) {
      return `room type ${room}: rooms is null or a whole number from 0, beds 1 or 2`;
    }
  }
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) return `signup ${e.id} is listed twice`;
    ids.add(e.id);
    if (Number.isNaN(Date.parse(e.submittedAt))) return `signup ${e.id}: submittedAt isn't a time`;
  }
  return null;
};

/**
 * @function allocate
 * @param entries {readonly LanEntry[]} every signup; only pending, accepted and waitlisted ones
 *        compete for seats
 * @param limits {LanLimits} seats, room types and kind priority
 * @returns {Result<LanAllocation>} the first `capacity` signups in seating order accepted and the
 *          rest waitlisted; companions seated after every signup, earliest signup first; rooms by
 *          roomGroups while stock lasts, a group roomed only when all of it is accepted. bad-input
 *          for a bad capacity or room stock, a repeated id or a submittedAt that isn't a time
 */
export const allocate = (
  entries: readonly LanEntry[],
  limits: LanLimits,
): Result<LanAllocation> => {
  const bad = checkLimits(entries, limits);
  if (bad !== null) return fail("bad-input", bad);
  const order = seatingOrder(entries.filter(isActive), limits.priority);
  const cap = limits.capacity ?? Number.POSITIVE_INFINITY;
  const accepted = order.slice(0, cap).map((e) => e.id);
  const seated = new Set(accepted);
  const waitlisted = order.slice(accepted.length).map((e) => e.id);
  let headcount = accepted.length;
  const companionShort: string[] = [];
  for (const e of order.filter((x) => x.hasCompanion && seated.has(x.id)).sort(byTimeThenId)) {
    if (headcount < cap) headcount += 1;
    else companionShort.push(e.id);
  }
  // Counted in a Map (not an object) so a room type key never reads Object.prototype.
  const used = new Map<string, number>();
  const roomed: string[] = [];
  const roomShort: string[] = [];
  for (const g of roomGroups(entries, limits)) {
    const { rooms } = stockOf(limits.inventory, g.room) as RoomStock;
    const count = used.get(g.room) ?? 0;
    if (g.memberIds.every((id) => seated.has(id)) && (rooms === null || count < rooms)) {
      used.set(g.room, count + 1);
      roomed.push(...g.memberIds);
    } else {
      // A half-seated pair keeps its seat, not the room.
      roomShort.push(...g.memberIds.filter((id) => seated.has(id)));
    }
  }
  for (const e of order) {
    if (seated.has(e.id) && e.room !== null && !stockOf(limits.inventory, e.room)) {
      roomShort.push(e.id);
    }
  }
  const roomsUsed = Object.fromEntries(used);
  return ok({ accepted, waitlisted, companionShort, roomed, roomShort, roomsUsed, headcount });
};
