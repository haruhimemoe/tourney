/**
 * @file tests/lan-properties.test.ts
 * @desc allocate over 300 seeded LAN signup lists (0 to 40 signups, every kind and status, tied
 *       times, single, twin, gone and no room, mutual and one-sided roommates, companions, open
 *       or tight capacity and stock): frozen input, the seat and room partitions, seating order,
 *       headcount, room stock, pairs roomed together, and the same answer for reversed input.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { describe, expect, it } from "vitest";
import { allocate, type LanEntry, type LanLimits } from "../src/lan-allocate.js";
import { LAN_STATUSES } from "../src/lan-schema.js";
import { freeze, rng, unwrap } from "./fixtures.js";

const PRIORITY = ["staff", "player", "attendee"];

const rank = (kind: string) => (PRIORITY.includes(kind) ? PRIORITY.indexOf(kind) : 3);

/** Below 0 when a seats before b: kind rank, then instant, then id. */
const compare = (a: LanEntry, b: LanEntry) =>
  rank(a.kind) - rank(b.kind) ||
  Date.parse(a.submittedAt) - Date.parse(b.submittedAt) ||
  (a.id < b.id ? -1 : 1);

const generate = (random: () => number) => {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const rows: LanEntry[] = Array.from({ length: Math.floor(random() * 41) }, (_, i) => ({
    id: `s${i}`,
    kind: pick(["staff", "player", "attendee", "vip"]),
    status: pick(LAN_STATUSES),
    submittedAt: `2026-09-01T00:0${Math.floor(random() * 10)}:00Z`, // ten minutes: ties happen
    room: pick(["single", "twin", "gone", null]),
    roommateId: null,
    hasCompanion: random() < 0.2,
  }));
  const twins = rows.filter((r) => r.room === "twin");
  for (const r of twins) {
    const mate = pick(twins);
    if (r.roommateId !== null || mate === r || random() < 0.3) continue;
    r.roommateId = mate.id;
    if (mate.roommateId === null && random() < 0.7) mate.roommateId = r.id; // mutual
  }
  const rooms = () => (random() < 0.2 ? null : Math.floor(random() * 4));
  const limits: LanLimits = {
    capacity: random() < 0.2 ? null : Math.floor(random() * 31),
    inventory: { single: { rooms: rooms(), beds: 1 }, twin: { rooms: rooms(), beds: 2 } },
    priority: PRIORITY,
  };
  return freeze({ rows, limits });
};

describe("allocate over 300 seeds", () => {
  it("keeps every property", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { rows, limits } = generate(rng(seed));
      const say = `seed ${seed}`;
      const got = unwrap(allocate(rows, limits)); // the input is frozen: any write would throw
      const byId = new Map(rows.map((r) => [r.id, r]));
      const row = (id: string) => byId.get(id) as LanEntry;
      const active = rows.filter((r) => ["pending", "accepted", "waitlisted"].includes(r.status));
      const cap = limits.capacity ?? Number.POSITIVE_INFINITY;

      // Accepted and waitlisted partition the active ids, and no seat is left while anyone waits.
      const order = [...got.accepted, ...got.waitlisted];
      expect([...order].sort(), say).toEqual(active.map((r) => r.id).sort());
      expect(got.accepted.length, say).toBe(Math.min(cap, active.length));
      // In seating order, so every accepted signup sorts before every waitlisted one.
      const sorted = order.every(
        (id, i) => i === 0 || compare(row(order[i - 1] ?? ""), row(id)) < 0,
      );
      expect(sorted, say).toBe(true);

      // Headcount is the accepted signups plus their seated companions, within capacity.
      const companions = got.accepted.filter((id) => row(id).hasCompanion);
      expect(
        got.companionShort.filter((id) => !companions.includes(id)),
        say,
      ).toEqual([]);
      const seatedCompanions = companions.length - got.companionShort.length;
      expect(got.headcount, say).toBe(got.accepted.length + seatedCompanions);
      expect(got.headcount, say).toBeLessThanOrEqual(cap);

      // Roomed and roomShort partition the accepted signups with a room; stock holds.
      const withRoom = got.accepted.filter((id) => row(id).room !== null);
      expect([...got.roomed, ...got.roomShort].sort(), say).toEqual(withRoom.sort());
      for (const [type, used] of Object.entries(got.roomsUsed)) {
        const rooms = limits.inventory[type]?.rooms;
        expect(rooms === null || (rooms !== undefined && used <= rooms), say).toBe(true);
      }

      // A seated mutual pair is roomed together or not at all.
      for (const id of got.accepted) {
        const mate = byId.get(row(id).roommateId ?? "");
        if (!mate || mate.roommateId !== id || !got.accepted.includes(mate.id)) continue;
        expect(got.roomed.includes(id), say).toBe(got.roomed.includes(mate.id));
      }

      expect(allocate([...rows].reverse(), limits), say).toEqual({ ok: true, value: got });
    }
  });
});
