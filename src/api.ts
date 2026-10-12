/**
 * @file src/api.ts
 * @desc @haruhimemoe/tourney/api: the schemas of tourney.haruhime.moe's public API v1, shared by
 *       its server and its clients. Reads (api-reads) and write bodies and answers (api-writes).
 *       Like the root entry: no clock, no network, no @haruhimemoe/osu.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

export * from "./api-reads.js";
export * from "./api-writes.js";
