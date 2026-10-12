/**
 * @file src/api-writes.ts
 * @desc What tourney.haruhime.moe's public API v1 takes and answers on writes: registrations,
 *       match time and staff changes, results, mp fills and announcements. Bodies refuse unknown
 *       keys (map and pick/ban entries, as stored, drop them); their types are what a caller
 *       sends, defaults optional.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { z } from "zod";
import { ApiMatchSchema } from "./api-reads.js";
import { BracketSchema } from "./bracket.js";
import { IdSchema, InstantSchema, OsuIdSchema, SideSchema } from "./ids.js";
import { MapResultSchema, MatchSchema, PickBanEntrySchema } from "./match.js";
import { REGISTRATION_STATUSES } from "./registration.js";

/** The match staff slots a key can fill or empty. */
export const API_SLOT_KINDS = ["referee", "streamer", "commentator"] as const;

const wins = z.number().int().min(0).max(13);

/** A registration as the key's owner: answers by question id, and a team when it takes one. */
export const ApiRegistrationInputSchema = z.strictObject({
  answers: z.record(z.string().max(32), z.unknown()),
  team: z
    .strictObject({
      name: z.string().max(64),
      tag: z.string().max(16).nullable(),
      members: z.array(OsuIdSchema).max(32),
    })
    .nullable()
    .optional(),
});

/** A registration body. */
export type ApiRegistrationInput = z.input<typeof ApiRegistrationInputSchema>;

/** One staff change: add or remove someone in a slot. */
export const ApiStaffChangeSchema = z.strictObject({
  op: z.enum(["add", "remove"]),
  kind: z.enum(API_SLOT_KINDS),
  osuId: OsuIdSchema,
});

/** One staff change. */
export type ApiStaffChange = z.input<typeof ApiStaffChangeSchema>;

/** A match change: a new time (null clears it) or one staff change. Send exactly one. */
export const ApiMatchPatchSchema = z.strictObject({
  scheduledAt: InstantSchema.nullable().optional(),
  staff: ApiStaffChangeSchema.optional(),
});

/** A match change body. */
export type ApiMatchPatch = z.input<typeof ApiMatchPatchSchema>;

/** A result: a score or the maps it is counted from, pick/bans, first turns and links. */
export const ApiResultInputSchema = z.strictObject({
  score: z.strictObject({ a: wins, b: wins }).optional(),
  maps: z.array(MapResultSchema).max(64),
  pickBans: z.array(PickBanEntrySchema).max(64),
  first: z
    .strictObject({ protect: SideSchema.optional(), ban: SideSchema, pick: SideSchema })
    .optional(),
  mpLinks: MatchSchema.shape.mpLinks,
  streamUrl: MatchSchema.shape.streamUrl,
  vodUrl: MatchSchema.shape.vodUrl,
});

/** A result body. */
export type ApiResultInput = z.input<typeof ApiResultInputSchema>;

/** An mp link to read: warmups to mark, osu! game ids to skip, and side a's colour. */
export const ApiFillInputSchema = z.strictObject({
  mpLink: z.string().min(1).max(200),
  warmups: z.number().int().min(0).max(8).default(0),
  skip: z.array(z.number().int().positive()).max(64).default([]),
  colours: z.strictObject({ a: z.enum(["red", "blue"]) }).optional(),
});

/** A fill body. */
export type ApiFillInput = z.input<typeof ApiFillInputSchema>;

/** A new announcement. The title is trimmed; `pinned` defaults to false. */
export const ApiAnnouncementInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(10_000),
  pinned: z.boolean().default(false),
});

/** An announcement body. */
export type ApiAnnouncementInput = z.input<typeof ApiAnnouncementInputSchema>;

/** A registration as stored for the caller: answers, team, status and when it was made. */
export const ApiRegistrationSchema = z.object({
  id: IdSchema,
  osuId: OsuIdSchema,
  kind: z.enum(["player", "staff"]),
  status: z.enum(REGISTRATION_STATUSES),
  answers: z.record(z.string(), z.unknown()),
  team: z
    .object({ name: z.string(), tag: z.string().nullable(), members: z.array(OsuIdSchema) })
    .nullable(),
  createdAt: InstantSchema,
});

/** A registration. */
export type ApiRegistration = z.infer<typeof ApiRegistrationSchema>;

/** A match's staff slots by osu! id. */
export const ApiMatchSlotsSchema = z.object({
  referees: z.array(OsuIdSchema),
  streamers: z.array(OsuIdSchema),
  commentators: z.array(OsuIdSchema),
});

/** A match's staff slots. */
export type ApiMatchSlots = z.infer<typeof ApiMatchSlotsSchema>;

/** An announcement. `editedAt` is null until it is edited. */
export const ApiAnnouncementSchema = z.object({
  id: IdSchema,
  title: z.string(),
  body: z.string(),
  pinned: z.boolean(),
  postedAt: InstantSchema,
  editedAt: InstantSchema.nullable(),
});

/** An announcement. */
export type ApiAnnouncement = z.infer<typeof ApiAnnouncementSchema>;

const FillSide = z.object({
  players: z.array(OsuIdSchema),
  team: z.enum(["red", "blue"]).optional(),
});

/** An mp link read into maps, score, winner and problems, with the sides it used. Not saved. */
export const ApiFillSchema = z.object({
  maps: z.array(MapResultSchema),
  score: z.object({ a: z.number().int(), b: z.number().int() }),
  winner: SideSchema.nullable(),
  problems: z.array(z.object({ code: z.string(), gameId: z.number().int(), message: z.string() })),
  sides: z.object({ a: FillSide, b: FillSide }),
});

/** An mp link read. */
export type ApiFill = z.infer<typeof ApiFillSchema>;

/** The answer to a registration. */
export const ApiRegistrationResponseSchema = z.object({ registration: ApiRegistrationSchema });

/** The answer to a registration. */
export type ApiRegistrationResponse = z.infer<typeof ApiRegistrationResponseSchema>;

/** The answer to a match change: the match and its staff slots. */
export const ApiMatchUpdateResponseSchema = z.object({
  match: ApiMatchSchema,
  slots: ApiMatchSlotsSchema,
});

/** The answer to a match change. */
export type ApiMatchUpdateResponse = z.infer<typeof ApiMatchUpdateResponseSchema>;

/** The answer to a result: the match, and the bracket when the match is in one. */
export const ApiResultResponseSchema = z.object({
  match: ApiMatchSchema,
  bracket: BracketSchema.nullable(),
});

/** The answer to a result. */
export type ApiResultResponse = z.infer<typeof ApiResultResponseSchema>;

/** The answer to a fill. */
export const ApiFillResponseSchema = z.object({ fill: ApiFillSchema });

/** The answer to a fill. */
export type ApiFillResponse = z.infer<typeof ApiFillResponseSchema>;

/** The answer to an announcement. */
export const ApiAnnouncementResponseSchema = z.object({ announcement: ApiAnnouncementSchema });

/** The answer to an announcement. */
export type ApiAnnouncementResponse = z.infer<typeof ApiAnnouncementResponseSchema>;
