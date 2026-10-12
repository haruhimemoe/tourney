/**
 * @file tests/lan-allocate.test.ts
 * @desc LAN seating and rooms by example: kind priority, time and id order, inactive rows,
 *       companions, roommate pairs, room stock, room types that are gone or named like
 *       Object.prototype keys, bad input, room groups and the seating order itself.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { describe, expect, it } from "vitest";
import {
  allocate,
  type LanEntry,
  type LanLimits,
  roomGroups,
  seatingOrder,
} from "../src/lan-allocate.js";
import { freeze, unwrap } from "./fixtures.js";

const PRIORITY = ["staff", "player", "attendee"];
const INVENTORY: LanLimits["inventory"] = {
  single: { rooms: 1, beds: 1 },
  twin: { rooms: 1, beds: 2 },
};
const limits = (capacity: number | null, inventory = INVENTORY): LanLimits => ({
  capacity,
  inventory,
  priority: PRIORITY,
});
const at = (minute: number) => `2026-09-01T00:${String(minute).padStart(2, "0")}:00Z`;
const IDLE = { status: "pending", room: null, roommateId: null, hasCompanion: false } as const;
const signup = (id: string, kind: string, min: number, more: Partial<LanEntry> = {}): LanEntry => ({
  ...IDLE,
  id,
  kind,
  submittedAt: at(min),
  ...more,
});
const twin = (id: string, minute: number, roommateId: string | null = null) =>
  signup(id, "player", minute, { room: "twin", roommateId });

describe("allocate", () => {
  it("seats by kind, then time, then id, up to capacity", () => {
    const rows = [
      signup("a0", "attendee", 0),
      signup("p1", "player", 1),
      signup("s2", "staff", 2),
      signup("p3", "player", 3),
    ];
    const seats = unwrap(allocate(freeze(rows), limits(2)));
    expect(seats).toMatchObject({ accepted: ["s2", "p1"], waitlisted: ["p3", "a0"], headcount: 2 });
  });

  it("seats a kind missing from priority after attendee, and breaks equal times by id", () => {
    const rows = [signup("v", "vip", 0), signup("b", "attendee", 9), signup("a", "attendee", 9)];
    expect(unwrap(allocate(rows, limits(2)))).toMatchObject({
      accepted: ["a", "b"],
      waitlisted: ["v"],
    });
  });

  it("leaves rejected and withdrawn rows out of everything", () => {
    const rows = [
      signup("r", "staff", 0, { status: "rejected", room: "single", hasCompanion: true }),
      signup("w", "staff", 0, { status: "withdrawn", room: "twin", roommateId: "p" }),
      signup("p", "player", 1, { status: "accepted", room: "twin", roommateId: "w" }),
    ];
    expect(unwrap(allocate(rows, limits(1)))).toEqual({
      accepted: ["p"],
      waitlisted: [],
      companionShort: [],
      roomed: ["p"],
      roomShort: [],
      roomsUsed: { twin: 1 },
      headcount: 1,
    });
  });

  it("seats companions after every signup", () => {
    const rows = [
      signup("a", "attendee", 0, { hasCompanion: true }),
      signup("b", "player", 1),
      signup("c", "player", 2),
    ];
    expect(unwrap(allocate(rows, limits(3)))).toMatchObject({
      accepted: ["b", "c", "a"],
      companionShort: ["a"],
      headcount: 3,
    });
    expect(unwrap(allocate(rows, limits(4)))).toMatchObject({ companionShort: [], headcount: 4 });
  });

  it("rooms a mutual twin pair together, and only when both are seated", () => {
    const pair = [twin("x", 0, "y"), twin("y", 1, "x")];
    expect(unwrap(allocate(pair, limits(null)))).toMatchObject({
      roomed: ["x", "y"],
      roomShort: [],
      roomsUsed: { twin: 1 },
    });
    // A half-seated pair keeps its seat but not its room.
    expect(unwrap(allocate(pair, limits(1)))).toMatchObject({
      accepted: ["x"],
      waitlisted: ["y"],
      roomed: [],
      roomShort: ["x"],
      roomsUsed: {},
    });
  });

  it("gives a one-sided pointer two groups, the second short of a room", () => {
    const rows = [twin("x", 0, "y"), twin("y", 1)];
    expect(roomGroups(rows, limits(null)).map((g) => g.memberIds)).toEqual([["x"], ["y"]]);
    expect(unwrap(allocate(rows, limits(null)))).toMatchObject({ roomed: ["x"], roomShort: ["y"] });
  });

  it("runs out of single rooms, and seats a room type that is gone without a room", () => {
    const rows = [
      signup("x", "player", 0, { room: "single" }),
      signup("y", "player", 1, { room: "single" }),
      signup("z", "player", 2, { room: "gone" }),
    ];
    expect(unwrap(allocate(rows, limits(null)))).toMatchObject({
      accepted: ["x", "y", "z"],
      roomed: ["x"],
      roomShort: ["y", "z"],
      roomsUsed: { single: 1 },
    });
  });

  it("never runs out with no capacity and no room limit", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      signup(`s${i}`, "player", i % 10, { room: "single", hasCompanion: i % 3 === 0 }),
    );
    const open = limits(null, { single: { rooms: null, beds: 1 } });
    expect(unwrap(allocate(rows, open))).toMatchObject({
      waitlisted: [],
      companionShort: [],
      roomShort: [],
      roomsUsed: { single: 30 },
      headcount: 40,
    });
  });

  it("reads room types as own keys only", () => {
    const rows = [signup("x", "player", 0, { room: "constructor" })];
    expect(unwrap(allocate(rows, limits(null)))).toMatchObject({ roomed: [], roomShort: ["x"] });
    const own = unwrap(
      allocate(rows, limits(null, { constructor: { rooms: 1, beds: 1 as const } })),
    );
    expect(own).toMatchObject({ roomed: ["x"], roomShort: [] });
    expect(Object.entries(own.roomsUsed)).toEqual([["constructor", 1]]);
  });

  it.each([
    ["capacity -1", [], limits(-1)],
    ["capacity 1.5", [], limits(1.5)],
    ["rooms -1", [], limits(null, { single: { rooms: -1, beds: 1 } })],
    ["beds 3", [], limits(null, JSON.parse('{ "twin": { "rooms": 1, "beds": 3 } }'))],
    ["a repeated id", [signup("x", "player", 0), signup("x", "staff", 1)], limits(null)],
    ["a time that isn't one", [signup("x", "player", 0, { submittedAt: "nope" })], limits(null)],
  ])("refuses %s", (_, rows, bad) => {
    expect(allocate(rows, bad)).toMatchObject({ ok: false, error: { code: "bad-input" } });
  });
});

describe("roomGroups and seatingOrder", () => {
  it("marks a twin's companion or empty bed, keyed by the smallest member id", () => {
    const rows = [
      signup("x", "player", 0, { room: "twin", hasCompanion: true }),
      twin("y", 1),
      twin("q", 2, "p"),
      twin("p", 3, "q"),
      signup("z", "player", 4, { room: "single", hasCompanion: true }),
    ];
    expect(roomGroups(rows, limits(null))).toEqual([
      { key: "room:x", room: "twin", memberIds: ["x"], companionOf: "x", emptyBed: false },
      { key: "room:y", room: "twin", memberIds: ["y"], companionOf: null, emptyBed: true },
      { key: "room:p", room: "twin", memberIds: ["q", "p"], companionOf: null, emptyBed: false },
      { key: "room:z", room: "single", memberIds: ["z"], companionOf: null, emptyBed: false },
    ]);
  });

  it("sorts a copy by kind, instant and id, keeping the caller's fields", () => {
    const rows = freeze([
      { ...signup("x", "player", 45), note: 1 },
      { ...signup("y", "player", 0, { submittedAt: "2026-09-01T02:30:00+02:00" }), note: 2 },
      { ...signup("s", "staff", 59), note: 3 },
    ]);
    expect(seatingOrder(rows, PRIORITY).map((r) => [r.id, r.note])).toEqual([
      ["s", 3],
      ["y", 2],
      ["x", 1],
    ]);
  });
});
