/**
 * @file src/api-reads.ts
 * @desc What tourney.haruhime.moe's public API v1 answers to reads: the error body, pages, and
 *       the lineage, edition, round, team, match, standings, placements and caller shapes.
 *       Stored schemas minus what stays private (notes, staff ids, reschedules). No refinements.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { z } from "zod";
import { BracketSchema } from "./bracket.js";
import { IdSchema, InstantSchema, OsuIdSchema } from "./ids.js";
import { FormatSchema, RoundSchema } from "./ladder.js";
import { MatchSchema } from "./match.js";
import { PickBanRulesSchema } from "./pickban.js";
import { TeamSchema } from "./team.js";
import { TournamentSchema } from "./tournament.js";

/** What every API key starts with. */
export const API_KEY_PREFIX = "htr_";

/** Items per page: `limit` runs `min` to `max`, `default` when not given. */
export const API_PAGE_LIMIT = { min: 1, max: 100, default: 50 } as const;

/** Where a team stands in an edition. */
export const TEAM_STATUSES = ["active", "eliminated", "withdrawn"] as const;

const Ref = z.object({ id: IdSchema, slug: z.string(), name: z.string() });

/** Every error answer's body: a code, a message, field errors or reasons, and a body's issues. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    errors: z.record(z.string(), z.string()).optional(),
    reasons: z.array(z.string()).optional(),
  }),
  issues: z
    .array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }))
    .optional(),
});

/** An error answer. */
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * @function apiPageSchema
 * @param item {T} the schema of one item
 * @returns {z.ZodObject} a page: `items`, and `next`, the next page's cursor or null on the last
 */
export const apiPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), next: z.string().nullable() });

/** A lineage: the tournament series its editions belong to. */
export const ApiLineageSchema = Ref.extend({ description: z.string() });

/** A lineage. */
export type ApiLineage = z.infer<typeof ApiLineageSchema>;

/** One edition in a lineage's list. */
export const ApiEditionSummarySchema = TournamentSchema.pick({
  id: true,
  name: true,
  code: true,
  mode: true,
  phase: true,
}).extend({ slug: z.string(), year: z.number().int(), archived: z.boolean() });

/** One edition in a lineage's list. */
export type ApiEditionSummary = z.infer<typeof ApiEditionSummarySchema>;

/** One registration question. `options` only for a question with choices. */
export const ApiQuestionSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  help: z.string(),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
});

/** One registration question. */
export type ApiQuestion = z.infer<typeof ApiQuestionSchema>;

/** An edition: the tournament, its page, bracket settings, eligibility and pick/ban rules. */
export const ApiEditionSchema = TournamentSchema.extend({
  lineage: Ref,
  slug: z.string(),
  year: z.number().int(),
  acronym: z.string().nullable(),
  dates: z.object({ start: InstantSchema.nullable(), end: InstantSchema.nullable() }),
  rulesText: z.string(),
  bannerUrl: z.string().nullable(),
  hue: z.number().int().nullable(),
  socials: z.array(z.object({ kind: z.string(), url: z.string(), label: z.string().nullable() })),
  contact: z.object({ email: z.string().nullable(), discord: z.string().nullable() }),
  qualifiers: z.object({ enabled: z.boolean(), method: z.string() }),
  bracket: z
    .object({
      format: FormatSchema,
      size: z.number().int(),
      bestOf: z.record(z.string(), z.number().int()),
      thirdPlace: z.boolean(),
      grandFinalReset: z.boolean(),
      seeding: z.string(),
    })
    .nullable(),
  eligibility: z.object({
    rank: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
    countries: z.array(z.string()).nullable(),
    regions: z.array(z.string()).nullable(),
  }),
  pickBanRules: PickBanRulesSchema.nullable(),
  questions: z.array(ApiQuestionSchema).nullable(),
  createdAt: InstantSchema,
  updatedAt: InstantSchema,
});

/** An edition. */
export type ApiEdition = z.infer<typeof ApiEditionSchema>;

/** A round: the ladder round plus its pool, star range and play window. */
export const ApiRoundSchema = RoundSchema.extend({
  id: IdSchema,
  poolId: z.string().nullable(),
  poolRevealed: z.boolean(),
  starRange: z.object({ min: z.number(), max: z.number() }).nullable(),
  window: z.object({ start: InstantSchema, end: InstantSchema }).nullable(),
});

/** A round. */
export type ApiRound = z.infer<typeof ApiRoundSchema>;

/** A team with its status, and usernames by osu! id where they are known. */
export const ApiTeamSchema = TeamSchema.extend({
  status: z.enum(TEAM_STATUSES),
  usernames: z.record(z.string(), z.string()),
});

/** A team. */
export type ApiTeam = z.infer<typeof ApiTeamSchema>;

/** A match without its staff ids, reschedules and notes. Unknown keys are dropped. */
export const ApiMatchSchema = MatchSchema.omit({
  refereeIds: true,
  streamerIds: true,
  commentatorIds: true,
  reschedules: true,
  notes: true,
});

/** A match. */
export type ApiMatch = z.infer<typeof ApiMatchSchema>;

/** One standings row, as `groupStandings` gives it. */
export const ApiStandingSchema = z.object({
  entrantId: IdSchema,
  place: z.number().int(),
  played: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  mapsWon: z.number().int(),
  mapsLost: z.number().int(),
  points: z.number().int(),
  tied: z.boolean(),
});

/** One standings row. */
export type ApiStanding = z.infer<typeof ApiStandingSchema>;

/** The answer to a lineage read: the lineage and its editions. */
export const ApiLineageResponseSchema = z.object({
  lineage: ApiLineageSchema,
  editions: z.array(ApiEditionSummarySchema),
});

/** The answer to a lineage read. */
export type ApiLineageResponse = z.infer<typeof ApiLineageResponseSchema>;

/** The answer to an edition read. */
export const ApiEditionResponseSchema = z.object({ edition: ApiEditionSchema });

/** The answer to an edition read. */
export type ApiEditionResponse = z.infer<typeof ApiEditionResponseSchema>;

/** The answer to a rounds read. */
export const ApiRoundsResponseSchema = z.object({ rounds: z.array(ApiRoundSchema) });

/** The answer to a rounds read. */
export type ApiRoundsResponse = z.infer<typeof ApiRoundsResponseSchema>;

/** A page of teams. */
export const ApiTeamsPageSchema = apiPageSchema(ApiTeamSchema);

/** A page of teams. */
export type ApiTeamsPage = z.infer<typeof ApiTeamsPageSchema>;

/** The answer to a bracket read: null before the bracket is made. */
export const ApiBracketResponseSchema = z.object({ bracket: BracketSchema.nullable() });

/** The answer to a bracket read. */
export type ApiBracketResponse = z.infer<typeof ApiBracketResponseSchema>;

/** A page of matches. */
export const ApiMatchesPageSchema = apiPageSchema(ApiMatchSchema);

/** A page of matches. */
export type ApiMatchesPage = z.infer<typeof ApiMatchesPageSchema>;

/** The answer to a match read. */
export const ApiMatchResponseSchema = z.object({ match: ApiMatchSchema });

/** The answer to a match read. */
export type ApiMatchResponse = z.infer<typeof ApiMatchResponseSchema>;

/** The answer to a standings read: each group's table, and the swiss table. */
export const ApiStandingsResponseSchema = z.object({
  groups: z.array(z.object({ id: z.string(), name: z.string(), rows: z.array(ApiStandingSchema) })),
  swiss: z.array(ApiStandingSchema),
});

/** The answer to a standings read. */
export type ApiStandingsResponse = z.infer<typeof ApiStandingsResponseSchema>;

/** The answer to a placements read: the champion, and each entrant's place (null until known). */
export const ApiPlacementsResponseSchema = z.object({
  champion: IdSchema.nullable(),
  placements: z.array(z.object({ entrantId: IdSchema, place: z.number().int().nullable() })),
});

/** The answer to a placements read. */
export type ApiPlacementsResponse = z.infer<typeof ApiPlacementsResponseSchema>;

/** The answer to `/me`: the key's owner. */
export const ApiMeResponseSchema = z.object({
  user: z.object({ id: IdSchema, osuId: OsuIdSchema, username: z.string() }),
});

/** The answer to `/me`. */
export type ApiMeResponse = z.infer<typeof ApiMeResponseSchema>;
